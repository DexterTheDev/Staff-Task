const { Client, MessageEmbed, MessageActionRow, MessageButton } = require("discord.js");
const client = new Client({ disableEveryone: true, disabledEvents: ["TYPING_START"], intents: 32767, partials: ['MESSAGE', 'CHANNEL', 'REACTION'] });
const config = require("./config");
const USERS = require("./models/users");
const GUILDS = require("./models/server");
const mongoose = require("mongoose");

client.on("ready", () => {
    console.log(`${client.user.username} is connected...`);
    mongoose.connect(config.mongodb, {
        useNewUrlParser: true,
        useUnifiedTopology: true
    }, (err) => {
        if (err) return console.error(err);
        console.log("Database is connected...")
    });

    setInterval(async () => {
        let guilds = await GUILDS.find({});

        guilds.map(async guild => {
            let users = await USERS.find({ sid: guild.sid });
            users.map(async user => {
                if (user.works.size >= 1) {
                    for (const [role, time] of user.works.entries()) {
                        let dates = {
                            time: time.split("-")[0],
                            now: time.split("-")[1],
                            msg: time.split("-")[2]
                        }

                        if (dates.time - (Date.now() - dates.now) < 0) {
                            user.works.delete(role);
                            await user.save();
                            let member = await client.guilds.cache.get(guild.sid).members.cache.get(user.id);
                            const filter = (m) => m.author.id === member.id;
                            member.send("Would you like to re-fresh your role check-in? \`yes/no\` (10 mins)").then(async msg => {
                                msg.channel.awaitMessages({
                                    filter,
                                    time: 10 * 60000,
                                    max: 1
                                }).then(async messages => {
                                    if (!messages.first()) {
                                        client.guilds.cache.get(guild.sid).channels.cache.get(guild.logs).messages?.fetch(dates.msg).then(m => {
                                            if(m) m.delete();
                                        });
                                        await client.guilds.cache.get(guild.sid).channels.cache.get(guild.logs).send(`**${member} role has been time-out, Please create a new post if necessary.**`)
                                        member.send("**:x: Role check-in timed out. Please create a new post if necessary.**");
                                    }
                                    if (["yes", "confirm", "accept", "agree"].includes(messages.first().content.toLowerCase())) {
                                        member.send("How long do you plan on doing this again? (1 mins)").then(msg => {
                                            msg.channel.awaitMessages({
                                                filter,
                                                time: 1 * 60000,
                                                max: 1
                                            }).then(async messages => {
                                                if (!messages.first()) member.send("**:x: Role check-in timed out. Please create a new post if necessary.**");
                                                else {
                                                    let time = require("ms")(messages.first().content)
                                                    if (!time || time == undefined) member.send("**:x: Unknow time format, Your role has been declined**");
                                                    else {
                                                        user.works.set(role, `${time}-${Date.now()}-${dates.msg}`);
                                                        await user.save();
                                                        member.send("**Your role has been updated**")
                                                        await client.guilds.cache.get(guild.sid).channels.cache.get(guild.logs).send(`**${member} role has been updated for ${require("ms")(time, { long: true })}**`)
                                                    }
                                                }
                                            })
                                        })
                                    } else {
                                        client.guilds.cache.get(guild.sid).channels.cache.get(guild.logs).messages?.fetch(dates.msg).then(m => {
                                            if(m) m.delete();
                                        });
                                        member.send("**Your role has been declined. Please create a new post if necessary.**")
                                    }
                                })
                            })
                        }
                    }
                }
            })
        })
    }, 5000)
});

client.on("messageCreate", async message => {
    if (message.author.bot || message.channel.type == "DM" || !message.content.toLowerCase().startsWith(config.prefix)) return;

    let args = message.content.substring(config.prefix.length).split(" ");
    let guild = await GUILDS.findOne({ sid: message.guild.id });
    if (!guild) guild = await new GUILDS({ sid: message.guild.id }).save();

    switch (args[0]) {
        case 'setlogs':
            let ch = message.mentions.channels.first() || message.guild.channels.cache.get(args[1]);
            if (!ch) message.reply("**:x: Unknow channel**")
            else {
                guild.logs = ch.id
                await guild.save();
                message.reply(`**Check-in logs channel has been set to \`${ch.name}\`**`)
            }
            break;
        case 'setchannel':
            if (!guild.logs) return message.reply(`**:x: You need to set check-in logs channel first \`${config.prefix}setlogs\`**`)
            let channel = message.mentions.channels.first() || message.guild.channels.cache.get(args[1]);
            if (!channel) message.reply("**:x: Unknow channel**")
            else {
                channel.send({
                    embeds: [
                        new MessageEmbed()
                            .setTitle("Check-in here!")
                            .setDescription("**The Bot will dm you with form to complete**")
                            .setColor("PURPLE")],
                    components: [
                        new MessageActionRow()
                            .addComponents(
                                new MessageButton()
                                    .setCustomId(message.guild.id)
                                    .setLabel('📜 Check-in!')
                                    .setStyle('PRIMARY'),
                            )]
                })
                    .then(async msg => {
                        if (guild.channel) {
                            message.guild.channels.cache.get(guild.channel).messages?.fetch(guild.message).then(m => {
                                if(m) m.delete();
                            });
                            guild.channel = channel.id
                            guild.message = msg.id
                        } else {
                            guild.channel = channel.id
                            guild.message = msg.id
                        }
                        await guild.save();
                        message.reply(`**Check-in has been set at \`${channel.name}\`**`)
                    })
                    .catch(() => {
                        message.reply(`**:x: Missing Permissions to send in \`${channel.name}\`**`)
                    })
            }
            break;
    }
})

client.on("interactionCreate", async (interaction) => {
    if (!interaction.isButton()) return;
    await interaction.deferUpdate().catch(() => { });
    let guild = await GUILDS.findOne({ sid: interaction.message.guildId });
    if (!guild) guild = await new GUILDS({ sid: interaction.message.guildId }).save();

    if (!interaction.user.bot && guild.sid) {
        if (interaction.customId === guild.sid) {
            let user = await USERS.findOne({ id: interaction.member.id, sid: interaction.message.guildId });
            if (!user) user = await new USERS({ id: interaction.member.id, sid: interaction.message.guildId }).save();

            const filter = (m) => m.author.id === interaction.member.id;
            interaction.member.send("Give a brief sentence to describe what you will be covering on the server today (2mins):").then(msg => {
                const data = {};
                msg.channel.awaitMessages({
                    filter,
                    time: 2 * 60000,
                    max: 1
                }).then(messages => {
                    if (!messages.first()) interaction.member.send("**:x: Timeout, retry again**");
                    else if (messages.first().content.length < 10) interaction.member.send("**:x: Describe what you will be covering on the server today in more than \`10\` length, retry again**")
                    else {
                        data.description = messages.first().content;
                        interaction.member.send("How long do you plan on doing this? (1min)").then(msg => {
                            msg.channel.awaitMessages({
                                filter,
                                time: 1 * 60000,
                                max: 1
                            }).then(async messages => {
                                if (!messages.first()) interaction.member.send("**:x: Timeout, retry again**");
                                else {
                                    let time = require("ms")(messages.first().content)
                                    if (!time || time == undefined) interaction.member.send("**:x: Unknow time format**");
                                    else {
                                        data.time = time
                                        interaction.member.send("**Your role has been created**")
                                        await client.guilds.cache.get(interaction.message.guildId).channels.cache.get(guild.logs).send({
                                            embeds: [new MessageEmbed()
                                                .setTitle(interaction.member.displayName)
                                                .setThumbnail(interaction.member.displayAvatarURL({ dynamic: true }))
                                                .setDescription(`**${data.description}**\nEstimated time: **\`${require("ms")(time, { long: true })}\`**`)
                                                .setTimestamp()
                                                .setColor("PURPLE")
                                            ]
                                        })
                                        .then(async msg => {
                                            user.works.set(data.description.split('.').join(' '), `${data.time}-${Date.now()}-${msg.id}`);
                                            await user.save();
                                        })
                                        .catch(() => { });
                                    }
                                }
                            })
                        })
                    }
                })
            })
        }
    }
})
client.login(config.token);