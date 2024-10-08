import discord
from discord.ext import commands
import requests
from bs4 import BeautifulSoup
import asyncio
import logging

# Set up logging
logging.basicConfig(level=logging.INFO)

# Replace with your bot token
TOKEN = ''

# URL to check for news
NEWS_URL = 'https://playspectre.com/news/'

# Track previously posted articles
posted_links = set()

# Store the news channel for each server (guild)
news_channels = {}

# Create the bot instance with slash command support
intents = discord.Intents.default()
intents.guilds = True  # Enable the guilds intent
bot = commands.Bot(command_prefix='!', intents=intents)

# Function to check for new news articles
def check_for_news():
    logging.info("Checking for new news articles...")
    
    try:
        # Fetch the news page
        response = requests.get(NEWS_URL)
        response.raise_for_status()  # Raise an exception for HTTP errors
        
        # Parse the HTML using BeautifulSoup
        soup = BeautifulSoup(response.text, 'html.parser')
        
        # Find all featured news articles in the specified structure
        articles = soup.find_all('article', class_='featured-news-card storyblok__outline')
        
        new_links = []
        for article in articles:
            link_tag = article.find('a', href=True)  # Get the link within the article
            link = link_tag['href'] if link_tag else None  # Extract the link
            
            # If this link hasn't been posted before, add it to new links list
            if link and link not in posted_links:
                # Fetch the article title if available
                title = article.find('h2')  # Assuming title is in an <h2> tag
                title_text = title.text.strip() if title else "No Title"  # Get the title text
                new_links.append(link)
                posted_links.add(link)  # Mark the link as posted
                logging.info(f"New article found: {title_text} - {link}")  # Log the title and link
        
        if not new_links:
            logging.info("No new articles found.")
        
        return new_links
    except Exception as e:
        logging.error(f"An error occurred while fetching news: {e}")
        return []

# Background task to check for news periodically and post to the set channels
async def news_check_task():
    await bot.wait_until_ready()  # Ensure the bot is ready

    while not bot.is_closed():
        new_links = check_for_news()

        if new_links:
            for guild_id, channel_id in news_channels.items():
                channel = bot.get_channel(channel_id)
                if channel:
                    for link in new_links:
                        await channel.send(f"New article posted: {link}")  # Send the new article link to the designated channel
        
        await asyncio.sleep(300)  # Wait for 5 minutes before checking again

# Slash command to set the news channel for a server
@bot.tree.command(name="setnewschannel", description="Set the channel where news will be posted.")
async def setnewschannel(interaction: discord.Interaction, channel: discord.TextChannel):
    # Save the selected channel for this guild
    news_channels[interaction.guild.id] = channel.id
    await interaction.response.send_message(f"News updates will be posted in {channel.mention}!")
    logging.info(f"News channel set to {channel.mention} in {interaction.guild.name}.")

# Slash command to fetch the latest news on demand
@bot.tree.command(name="fetchnews", description="Fetch the latest news articles.")
async def fetchnews(interaction: discord.Interaction):
    new_links = check_for_news()
    if new_links:
        await interaction.response.send_message("Latest news articles:\n" + "\n".join(new_links))
    else:
        await interaction.response.send_message("No new articles found.")
    logging.info(f"Latest news fetched in {interaction.guild.name}.")

# Bot event: When the bot is ready
@bot.event
async def on_ready():
    logging.info(f'Logged in as {bot.user}')
    # Sync the slash commands with Discord API globally
    await register_commands()

# Function to register commands globally
async def register_commands():
    # Register commands globally
    await bot.tree.sync()
    logging.info("Global slash commands registered.")

# Event triggered when the bot is added to a server
@bot.event
async def on_guild_join(guild: discord.Guild):
    logging.info(f'Bot has been added to the server: {guild.name} (ID: {guild.id})')

# Setup hook to start the background task when the bot is initialized
async def setup_hook():
    # Start the background task when the bot is ready
    bot.loop.create_task(news_check_task())

# Redefine bot's setup_hook
bot.setup_hook = setup_hook

# Main function to run the bot
async def main():
    async with bot:
        await bot.start(TOKEN)

# Run the bot using asyncio.run()
asyncio.run(main())