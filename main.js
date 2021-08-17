"use strict";

/**************************
 * Import important stuff *
 **************************/

// General stuff
const semver = require("semver");
const yargs = require("yargs");
const path = require("path");
const Logger = require("./src/Logger");
const MessageMap = require("./src/MessageMap");
const Bridge = require("./src/bridgestuff/Bridge");
const BridgeMap = require("./src/bridgestuff/BridgeMap");
const Settings = require("./src/settings/Settings");
const migrateSettingsToYAML = require("./src/migrateSettingsToYAML");
const jsYaml = require("js-yaml");
const fs = require("fs");
const R = require("ramda");
const os = require("os");

// Telegram stuff
const { Telegraf, TimeoutError } = require("telegraf");
const telegramSetup = require("./src/telegram2discord/setup");

// Discord stuff
const Discord = require("discord.js");
const discordSetup = require("./src/discord2telegram/setup");
const m1 = new Discord.Client();

if (!semver.gte(process.version, "14.9.0")) {
	console.log(`TediCross requires at least nodejs 14.9. Your version is ${process.version}`);
	process.exit();
}

/*************
 * TediCross *
 *************/

// Get command line arguments if any
const args = yargs
	.alias("v", "version")
	.alias("h", "help")
	.option("config", {
		alias: "c",
		default: path.join(__dirname, "settings.yaml"),
		describe: "Specify path to settings file",
		type: "string"
	})
	.option("data-dir", {
		alias: "d",
		default: path.join(__dirname, "data"),
		describe: "Specify the path to the directory to store data in",
		type: "string"
	}).argv;

// Migrate the settings from JSON to YAML
const settingsPathJSON = path.join(__dirname, "settings.json");
const settingsPathYAML = args.config;
migrateSettingsToYAML(settingsPathJSON, settingsPathYAML);

// Get the settings
const rawSettingsObj = jsYaml.safeLoad(fs.readFileSync(settingsPathYAML));
const settings = Settings.fromObj(rawSettingsObj);

// Initialize logger
const logger = new Logger(settings.debug);

// Write the settings back to the settings file if they have been modified
const newRawSettingsObj = settings.toObj();
if (R.not(R.equals(rawSettingsObj, newRawSettingsObj))) {
	// Turn it into notepad friendly YAML
	const yaml = jsYaml.safeDump(newRawSettingsObj).replace(/\n/g, "\r\n");

	try {
		fs.writeFileSync(settingsPathYAML, yaml);
	} catch (err) {
		if (err.code === "EACCES") {
			// The settings file is not writable. Give a warning
			logger.warn(
				"Changes to TediCross' settings have been introduced. Your settings file it not writable, so it could not be automatically updated. TediCross will still work, with the modified settings, but you will see this warning until you update your settings file"
			);

			// Write the settings to temp instead
			const tmpPath = path.join(os.tmpdir(), "tedicross-settings.yaml");
			try {
				fs.writeFileSync(tmpPath, yaml);
				logger.info(
					`The new settings file has instead been written to '${tmpPath}'. Copy it to its proper location to get rid of the warning`
				);
			} catch (err) {
				logger.warn(
					`An attempt was made to put the modified settings file at '${tmpPath}', but it could not be done. See the following error message`
				);
				logger.warn(err);
			}
		}
	}
}

// Create a Telegram bot
const tgBot = new Telegraf(settings.telegram.token, { channelMode: true });

// Create a Discord bot
const dcBot = new Discord.Client();

// Create a message ID map
const messageMap = new MessageMap();

// Create the bridge map
const bridgeMap = new BridgeMap(settings.bridges.map(bridgeSettings => new Bridge(bridgeSettings)));

/*********************
 * Set up the bridge *
 *********************/

discordSetup(logger, dcBot, tgBot, messageMap, bridgeMap, settings, args.dataDir);
telegramSetup(logger, tgBot, dcBot, messageMap, bridgeMap, settings, args.dataDir);

///////////// Music bot 2 

const { TOKEN, CHANNEL, STATUS, LIVE } = require("./config2.json");
const ytdl = require('ytdl-core');
let broadcast = null;
let interval = null;

if (!TOKEN) {
  console.error("Please provide a valid Discord Bot Token.");
  process.exit(1);
} else if (!CHANNEL || Number(CHANNEL) == NaN) {
  console.log("Please provide a valid channel ID.");
  process.exit(1);
} else if (!ytdl.validateURL(LIVE)) {
  console.log("Please provide a valid Youtube URL.");
  process.exit(1);
}

 m1.on('ready', async () => {
  m1.user.setActivity(STATUS, {type: 'LISTENING'});
  let channel = m1.channels.cache.get(CHANNEL) || await m1.channels.fetch(CHANNEL)

  if (!channel) {
    console.error("The provided channel ID doesn't exist, or I don't have permission to view that channel. Because of that, I'm aborting now.");
    process.exit(1);
  } else if (channel.type !== "voice") {
    console.error("The provided channel ID is NOT voice channel. Because of that, I'm aborting now.");
    process.exit(1);
  }
  broadcast = m1.voice.createBroadcast();
  // Play the radio
  let stream = ytdl(LIVE);
  stream.on('error', console.error);
  broadcast.play(stream);
  // Make interval so radio will automatically reconnect to YT every 30 minute because YT will change the raw url every 30m/1 Hour
  if (!interval) {
    interval = setInterval(async function() {
      try {
       if (stream && !stream.ended) stream.destroy();
       stream = ytdl(LIVE, { highWaterMark: 100 << 150 });
       stream.on('error', console.error);
       broadcast.play(stream);
      } catch (e) { return }
    }, 1800000)
  }
  try {
    const connection = await channel.join();
    connection.play(broadcast);
  } catch (error) {
    console.error(error);
  }
});

setInterval(async function() {
  if(!m1.voice.connections.size) {
    let channel = m1.channels.cache.get(CHANNEL) || await m1.channels.fetch(CHANNEL);
    if(!channel) return;
    try { 
      const connection = await channel.join();
      connection.play(broadcast);
    } catch (error) {
      console.error(error);
    }
  }
}, 20000);

m1.login(TOKEN) //Login

process.on('unhandledRejection', console.error);

m1.on('ready', () => {
    console.log('Music Jazz - Alive')
    });
