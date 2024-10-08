const { Client, GatewayIntentBits } = require('discord.js');
const axios = require('axios');
const fs = require('fs');

// Use the Discord token from environment variables
const TOKEN = process.env.DISCORD_TOKEN; // Replace with your actual token
const postedLinks = new Set();

// Create the bot instance with appropriate intents
const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages] });

// Function to check for new news articles
async function checkForNews() {
    console.log("Checking for new news articles...");

    const apiUrl = 'https://api.storyblok.com/v2/cdn/stories?token=gc3rBMVUv2aChH1oQGkG8Att&version=published';

    try {
        const response = await axios.get(apiUrl);
        const articles = response.data.stories; // Access the articles from the API response
        console.log(`Found ${articles.length} articles.`);

        const newLinks = [];
        let latestArticle = null;

        for (const article of articles) {
            const link = article.full_slug; // Get the full slug for the link
            const titleText = article.name || 'No Title'; // Title is usually the name field
            const publishedDate = new Date(article.published_at);

            // Check if this article is the latest one
            if (!latestArticle || publishedDate > new Date(latestArticle.published_at)) {
                latestArticle = { title: titleText, link: `https://playspectre.com/${link}`, published_at: article.published_at };
            }
        }

        if (latestArticle) {
            newLinks.push(latestArticle);
            postedLinks.add(latestArticle.link); // Mark the link as posted
            console.log(`Latest article found: ${latestArticle.title} - ${latestArticle.link}`);
        } else {
            console.log("No new articles found.");
        }

        return newLinks;
    } catch (error) {
        console.error(`An error occurred while fetching news: ${error.message}`);
        return [];
    }
}

// Background task to check for news periodically and post to the set channels
async function newsCheckTask() {
    while (true) {
        const newLinks = await checkForNews();

        if (newLinks.length > 0) {
            for (const [guildId, channelId] of Object.entries(newsChannels)) {
                try {
                    const channel = await client.channels.fetch(channelId);
                    if (channel && channel.isText()) { // Ensure it is a text channel
                        for (const { title, link } of newLinks) {
                            await channel.send(`New article posted: **${title}** - ${link}`);
                        }
                    }
                } catch (error) {
                    console.error(`Could not send message to channel ${channelId} in guild ${guildId}: ${error.message}`);
                }
            }
        }

        await new Promise(resolve => setTimeout(resolve, 300000)); // Wait for 5 minutes before checking again
    }
}

// Load existing news channels from the JSON file
function loadChannels() {
    if (fs.existsSync('channels.json')) {
        const data = fs.readFileSync('channels.json');
        return JSON.parse(data);
    }
    return {};
}

// Save the news channels to the JSON file
function saveChannels() {
    fs.writeFileSync('channels.json', JSON.stringify(newsChannels, null, 2));
}

// Load channels at startup
const newsChannels = loadChannels();

// Command to set the news channel for a server
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isCommand()) return;

    const { commandName, options } = interaction;

    if (commandName === 'setnewschannel') {
        const channel = options.getChannel('channel');
        // Check if the channel is a TextChannel
        if (channel && channel.type === 'GUILD_TEXT') {
            // Save the channel ID for the guild
            newsChannels[interaction.guild.id] = channel.id;
            saveChannels(); // Save the updated channels to the JSON file
            await interaction.reply(`News updates will be posted in ${channel}!`);
            console.log(`News channel set to ${channel} in ${interaction.guild.name}.`);
        } else {
            await interaction.reply('Please select a valid text channel.');
        }
    } else if (commandName === 'fetchnews') {
        const latestLinks = await checkForNews();
        if (latestLinks.length > 0) {
            await interaction.reply(`Latest news article:\n${latestLinks[0].title}: ${latestLinks[0].link}`);
        } else {
            await interaction.reply("No new articles found.");
        }
        console.log(`Latest news fetched in ${interaction.guild.name}.`);
    }
});

// Event triggered when the bot is ready
client.once('ready', async () => {
    console.log(`Logged in as ${client.user.tag}`);
    // Start the background task
    newsCheckTask();
});

// Registering global slash commands
client.on('ready', async () => {
    console.log('Registering commands...');

    const commands = client.application.commands;

    await commands.create({
        name: 'setnewschannel',
        description: 'Set the channel where news will be posted.',
        options: [
            {
                type: 7, // Use 7 for CHANNEL type
                name: 'channel',
                description: 'Select a text channel',
                required: true,
            },
        ],
    });

    await commands.create({
        name: 'fetchnews',
        description: 'Fetch the latest news articles.',
    });

    console.log('Commands registered!');
});

// Log in to Discord
client.login(TOKEN);
