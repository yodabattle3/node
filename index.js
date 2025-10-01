const { Client, GatewayIntentBits, Partials, Collection, AttachmentBuilder, SlashCommandBuilder, REST, Routes } = require("discord.js");
const { createCanvas } = require("canvas");
require("dotenv").config();

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent, GatewayIntentBits.GuildMembers],
  partials: [Partials.Message, Partials.Channel, Partials.Reaction],
});

let verifySettings = {}; // guildId: { channel: id, role: id }

// ====== Slash Commands ======
const commands = [
  new SlashCommandBuilder()
    .setName("verify-channel")
    .setDescription("Set the verification channel and role")
    .addRoleOption(option => option.setName("role").setDescription("Role to give after verifying").setRequired(true)),

  new SlashCommandBuilder()
    .setName("verify")
    .setDescription("Start the verification process")
].map(cmd => cmd.toJSON());

// Register commands when bot starts
client.once("ready", async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
  const rest = new REST({ version: "10" }).setToken(process.env.TOKEN);

  for (const guild of client.guilds.cache.values()) {
    try {
      await rest.put(
        Routes.applicationGuildCommands(client.user.id, guild.id),
        { body: commands }
      );
      console.log(`📌 Registered commands for ${guild.name}`);
    } catch (err) {
      console.error(err);
    }
  }
});

// ====== Command Handling ======
client.on("interactionCreate", async interaction => {
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === "verify-channel") {
    const role = interaction.options.getRole("role");
    verifySettings[interaction.guild.id] = {
      channel: interaction.channel.id,
      role: role.id,
    };

    await interaction.reply({
      content: `✅ Verification set!\nChannel: ${interaction.channel}\nRole: ${role}`,
      ephemeral: true,
    });
  }

  if (interaction.commandName === "verify") {
    const settings = verifySettings[interaction.guild.id];
    if (!settings) {
      await interaction.reply({ content: "⚠️ Verification not set up yet.", ephemeral: true });
      return;
    }
    if (interaction.channel.id !== settings.channel) {
      await interaction.reply({ content: "❌ Use this in the verification channel.", ephemeral: true });
      return;
    }

    // Generate captcha text
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    const captchaText = Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");

    // Draw captcha on canvas
    const canvas = createCanvas(250, 100);
    const ctx = canvas.getContext("2d");

    ctx.fillStyle = "#2c2f33";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.font = "40px Sans";
    ctx.fillStyle = "#ffffff";
    ctx.fillText(captchaText, 50, 60);

    // Send captcha image
    const attachment = new AttachmentBuilder(canvas.toBuffer(), { name: "captcha.png" });
    await interaction.reply({ content: "🔒 Type the text in this captcha within **60 seconds**:", files: [attachment], ephemeral: true });

    const filter = msg => msg.author.id === interaction.user.id && msg.channel.id === interaction.channel.id;
    const collector = interaction.channel.createMessageCollector({ filter, time: 60000, max: 1 });

    collector.on("collect", async msg => {
      if (msg.content.toUpperCase() === captchaText) {
        const role = interaction.guild.roles.cache.get(settings.role);
        await interaction.member.roles.add(role);
        await interaction.followUp({ content: `✅ Verified! You now have ${role}.`, ephemeral: true });
      } else {
        await interaction.followUp({ content: "❌ Wrong captcha. Try again with `/verify`.", ephemeral: true });
      }
    });

    collector.on("end", collected => {
      if (collected.size === 0) {
        interaction.followUp({ content: "⌛ Time expired. Try again with `/verify`.", ephemeral: true });
      }
    });
  }
});

client.login(process.env.TOKEN);
