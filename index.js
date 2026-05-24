const {
    Client,
    GatewayIntentBits,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    SlashCommandBuilder,
    REST,
    Routes
} = require('discord.js');

const mongoose = require('mongoose');
const express = require('express');

// ================= KEEP ALIVE =================
const app = express();

app.get('/', (req, res) => {
    res.send('🚖 Taxi Bot Online');
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`🌐 Porta ${PORT}`);
});

// ================= CLIENT =================
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

// ================= CONFIG =================
const STAFF_ROLE_ID = "1455329952395296901";
const DRIVER_ROLE_ID = "1455329847122591918";

const TAXI_CHANNEL_ID = "1468316689174364374";
const LOG_CHANNEL_ID = "1497716230130368642";
const PANEL_CHANNEL_ID = "1455328423156252824";

const OWNER_ROLE_ID = "1489313212586524742";

// ================= MONGO =================
mongoose.connect(process.env.MONGO_URI)
.then(() => console.log('✅ MongoDB connesso'))
.catch(err => console.log('❌ Mongo error:', err));

// ================= DATABASE =================

// SHIFT
const shiftSchema = new mongoose.Schema({

    userId: String,

    tempo: {
        type: Number,
        default: 0
    },

    corse: {
        type: Number,
        default: 0
    },

    recensioni: {
        type: Array,
        default: []
    },

    inShift: {
        type: Boolean,
        default: false
    },

    start: {
        type: Number,
        default: 0
    },

    stato: {
        type: String,
        default: 'Offline'
    }

});

const Shift = mongoose.model('Shift', shiftSchema);

// CORSE
const corsaSchema = new mongoose.Schema({

    clienteId: String,

    driverId: {
        type: String,
        default: null
    },

    nome: String,
    posizione: String,
    destinazione: String,

    completata: {
        type: Boolean,
        default: false
    },

    timestamp: {
        type: Date,
        default: Date.now
    }

});

const Corsa = mongoose.model('Corsa', corsaSchema);

// BLACKLIST
const blacklistSchema = new mongoose.Schema({

    userId: String,
    motivo: String

});

const Blacklist = mongoose.model('Blacklist', blacklistSchema);

// SANZIONI
const sanzioniSchema = new mongoose.Schema({

    userId: String,

    warn: {
        type: Number,
        default: 0
    },

    strike: {
        type: Number,
        default: 0
    }

});

const Sanzioni = mongoose.model('Sanzioni', sanzioniSchema);

// ================= VARIABILI =================
let driverOccupati = new Set();

const cooldownTaxi = new Map();

// ================= COMMANDS =================
const commands = [

    // ================= TAXI =================
    new SlashCommandBuilder()
    .setName('pannello-taxi')
    .setDescription('Invia pannello taxi'),

    new SlashCommandBuilder()
    .setName('fine-corsa')
    .setDescription('Termina corsa'),

    new SlashCommandBuilder()
    .setName('leaderboard')
    .setDescription('Top driver'),

    new SlashCommandBuilder()
    .setName('taxi-roulette')
    .setDescription('Scegli driver casuale'),

    // ================= SHIFT =================
    new SlashCommandBuilder()
    .setName('entra-shift')
    .setDescription('Entra in servizio'),

    new SlashCommandBuilder()
    .setName('esci-shift')
    .setDescription('Esci dal servizio'),

    new SlashCommandBuilder()
    .setName('shift-stats')
    .setDescription('Statistiche shift'),

    new SlashCommandBuilder()
    .setName('reset-shift')
    .setDescription('Resetta shift'),

// ================= TAXI DISPONIBILI =================
new SlashCommandBuilder()

.setName('taxi-disponibili')

.setDescription(
    'Mostra i taxisti disponibili'
),

// ================= RIMUOVI SANZIONE =================
new SlashCommandBuilder()

.setName('rimuovi-sanzione')

.setDescription(
    'Rimuovi una sanzione'
)

.addUserOption(o =>

    o.setName('utente')

    .setDescription('Taxista')

    .setRequired(true)
)

.addStringOption(o =>

    o.setName('tipo')

    .setDescription('Tipo')

    .setRequired(true)

    .addChoices(

        {
            name: 'Warn',
            value: 'warn'
        },

        {
            name: 'Strike',
            value: 'strike'
        }
      )
    ),

    // ================= BLACKLIST =================
    new SlashCommandBuilder()
    .setName('blacklist')
    .setDescription('Blacklist utente')

    .addUserOption(o =>
        o.setName('utente')
        .setDescription('Utente')
        .setRequired(true)
    )

    .addStringOption(o =>
        o.setName('motivo')
        .setDescription('Motivo')
        .setRequired(true)
    ),

    new SlashCommandBuilder()
    .setName('unblacklist')
    .setDescription('Rimuovi blacklist')

    .addUserOption(o =>
        o.setName('utente')
        .setDescription('Utente')
        .setRequired(true)
    ),

    // ================= SANZIONI =================
    new SlashCommandBuilder()
    .setName('sanziona')
    .setDescription('Sanziona taxista')

    .addUserOption(o =>
        o.setName('utente')
        .setDescription('Taxista')
        .setRequired(true)
    )

    .addStringOption(o =>
        o.setName('tipo')
        .setDescription('Tipo')
        .setRequired(true)

        .addChoices(
            {
                name: 'Warn',
                value: 'warn'
            },

            {
                name: 'Strike',
                value: 'strike'
            },

            {
                name: 'Licenziamento',
                value: 'licenziamento'
            }
        )
    )

    .addStringOption(o =>
        o.setName('motivo')
        .setDescription('Motivo')
        .setRequired(true)
    )

    .addStringOption(o =>
        o.setName('durata')
        .setDescription('Durata')
        .setRequired(false)
    )

].map(c => c.toJSON());

// ================= READY =================
client.once('ready', async () => {

    console.log(`✅ Online come ${client.user.tag}`);

    const rest = new REST({
        version: '10'
    }).setToken(process.env.TOKEN);

    try {

        console.log('⏳ Registro comandi...');

        await rest.put(
            Routes.applicationGuildCommands(
                process.env.CLIENT_ID,
                process.env.GUILD_ID
            ),

            {
                body: commands
            }
        );

        console.log('✅ Comandi registrati');

    } catch (err) {

        console.log(err);
    }
});
// ================= INTERAZIONI =================
client.on('interactionCreate', async interaction => {

    try {

        // ================= SLASH COMMANDS =================
        if (interaction.isChatInputCommand()) {

            const isStaff = interaction.member.roles.cache.has(STAFF_ROLE_ID);

            const isDriver = interaction.member.roles.cache.has(DRIVER_ROLE_ID);

            const isOwner = interaction.member.roles.cache.has(OWNER_ROLE_ID);

            // ================= PANNELLO TAXI =================
            if (interaction.commandName === 'pannello-taxi') {

                if (!isStaff)
                    return interaction.reply({
                        content: '❌ No permessi',
                        ephemeral: true
                    });

                const button = new ButtonBuilder()

                .setCustomId('chiama_taxi')

                .setLabel('🚖 Chiama Taxi')

                .setStyle(ButtonStyle.Primary);

                const embed = new EmbedBuilder()

                .setColor('Yellow')

                .setTitle('🚖 CENTRALE TAXI')

                .setDescription(
                    'Premi il bottone qui sotto per chiamare un taxi'
                )

                .setFooter({
                    text: 'Sistema Taxi Automatico'
                });

                const channel =
                await client.channels.fetch(PANEL_CHANNEL_ID);

                await channel.send({

                    embeds: [embed],

                    components: [
                        new ActionRowBuilder()
                        .addComponents(button)
                    ]
                });

                return interaction.reply({

                    content: '✅ Pannello inviato',

                    ephemeral: true
                });
            }
// ================= TAXI DISPONIBILI =================
if (interaction.commandName === 'taxi-disponibili') {

    const drivers = await Shift.find();

    if (!drivers.length)

        return interaction.reply({

            content: '❌ Nessun taxista trovato',

            ephemeral: true
        });

    const lista = drivers.map(driver => {

        let emoji = '🔴';

        let statoTesto = 'Offline';

        // ================= DISPONIBILE =================
        if (
            driver.inShift &&
            driver.stato === 'Disponibile'
        ) {

            emoji = '🟢';

            statoTesto = 'Disponibile';
        }

        // ================= OCCUPATO =================
        if (
            driver.inShift &&
            driver.stato === 'Occupato'
        ) {

            emoji = '🔴';

            statoTesto = 'Occupato';
        }

        // ================= PAUSA =================
        if (
            driver.inShift &&
            driver.stato === 'Pausa'
        ) {

            emoji = '🟡';

            statoTesto = 'In Pausa';
        }

        // ================= OFFLINE =================
        if (!driver.inShift) {

            emoji = '⚫';

            statoTesto = 'Offline';
        }

        let tempo = driver.tempo;

        if (driver.inShift)
            tempo += Date.now() - driver.start;

        const ore =
        (tempo / 3600000).toFixed(1);

        let media = '0';

        if (driver.recensioni.length) {

            media = (

                driver.recensioni.reduce(
                    (a, b) => a + b,
                    0
                )

                / driver.recensioni.length

            ).toFixed(1);
        }

        return `
${emoji} <@${driver.userId}>

📌 Stato: ${statoTesto}

🚖 Corse: ${driver.corse}

⭐ Media: ${media}

⏱️ Ore Shift: ${ore}h
`;

    }).join('\n━━━━━━━━━━━━━━\n');

    const embed = new EmbedBuilder()

    .setColor('Yellow')

    .setTitle('🚖 TAXI DISPONIBILI')

    .setDescription(lista)

    .setFooter({
        text:
        '🟢 Disponibile | 🔴 Occupato | 🟡 Pausa | ⚫ Offline'
    })

    .setTimestamp();

    return interaction.reply({

        embeds: [embed]
    });
}

// ================= RIMUOVI SANZIONE =================
if (interaction.commandName === 'rimuovi-sanzione') {

    if (!isStaff)

        return interaction.reply({

            content: '❌ No permessi',

            ephemeral: true
        });

    const user =
    interaction.options.getUser('utente');

    const tipo =
    interaction.options.getString('tipo');

    let dati =
    await Sanzioni.findOne({

        userId: user.id
    });

    if (!dati)

        return interaction.reply({

            content:
            '❌ Questo taxista non ha sanzioni',

            ephemeral: true
        });

    // ================= WARN =================
    if (tipo === 'warn') {

        if (dati.warn <= 0)

            return interaction.reply({

                content:
                '❌ Questo taxista non ha warn',

                ephemeral: true
            });

        dati.warn -= 1;
    }

    // ================= STRIKE =================
    if (tipo === 'strike') {

        if (dati.strike <= 0)

            return interaction.reply({

                content:
                '❌ Questo taxista non ha strike',

                ephemeral: true
            });

        dati.strike -= 1;
    }

    await dati.save();

    const embed = new EmbedBuilder()

    .setColor('Green')

    .setTitle('✅ SANZIONE RIMOSSA')

    .addFields(

        {
            name: '👤 Taxista',
            value: `${user}`
        },

        {
            name: '📌 Tipo Rimosso',
            value: tipo
        },

        {
            name: '⚠️ Warn Rimasti',
            value: `${dati.warn}`
        },

        {
            name: '🚨 Strike Rimasti',
            value: `${dati.strike}`
        }
    )

    .setTimestamp();

    return interaction.reply({

        embeds: [embed]
    });
}
            // ================= ENTRA SHIFT =================
            if (interaction.commandName === 'entra-shift') {

                if (!isDriver)
                    return interaction.reply({

                        content: '❌ Non sei taxista',

                        ephemeral: true
                    });

                let data = await Shift.findOne({

                    userId: interaction.user.id
                });

                if (!data)

                    data = new Shift({

                        userId: interaction.user.id
                    });

                if (data.inShift)

                    return interaction.reply({

                        content: '❌ Sei già in shift',

                        ephemeral: true
                    });

                data.inShift = true;

                data.start = Date.now();

                data.stato = 'Disponibile';

                await data.save();

                return interaction.reply({

                    embeds: [

                        new EmbedBuilder()

                        .setColor('Green')

                        .setTitle('🟢 SHIFT AVVIATO')

                        .setDescription(
                            `${interaction.user} è ora disponibile`
                        )
                    ]
                });
            }

            // ================= ESCI SHIFT =================
            if (interaction.commandName === 'esci-shift') {

                let data = await Shift.findOne({

                    userId: interaction.user.id
                });

                if (!data || !data.inShift)

                    return interaction.reply({

                        content: '❌ Non sei in shift',

                        ephemeral: true
                    });

                data.tempo += Date.now() - data.start;

                data.inShift = false;

                data.stato = 'Offline';

                driverOccupati.delete(interaction.user.id);

                await data.save();

                return interaction.reply({

                    embeds: [

                        new EmbedBuilder()

                        .setColor('Red')

                        .setTitle('🔴 SHIFT TERMINATO')

                        .setDescription(
                            `${interaction.user} è uscito dal turno`
                        )
                    ]
                });
            }

            // ================= FINE CORSA =================
            if (interaction.commandName === 'fine-corsa') {

                if (!driverOccupati.has(interaction.user.id))

                    return interaction.reply({

                        content: '❌ Nessuna corsa attiva',

                        ephemeral: true
                    });

                driverOccupati.delete(interaction.user.id);

                let data = await Shift.findOne({

                    userId: interaction.user.id
                });

                if (data) {

                    data.stato = 'Disponibile';

                    await data.save();
                }

                const recensione1 = new ButtonBuilder()

                .setCustomId(`rec_1_${interaction.user.id}`)

                .setLabel('⭐')

                .setStyle(ButtonStyle.Secondary);

                const recensione2 = new ButtonBuilder()

                .setCustomId(`rec_2_${interaction.user.id}`)

                .setLabel('⭐⭐')

                .setStyle(ButtonStyle.Secondary);

                const recensione3 = new ButtonBuilder()

                .setCustomId(`rec_3_${interaction.user.id}`)

                .setLabel('⭐⭐⭐')

                .setStyle(ButtonStyle.Secondary);

                const recensione4 = new ButtonBuilder()

                .setCustomId(`rec_4_${interaction.user.id}`)

                .setLabel('⭐⭐⭐⭐')

                .setStyle(ButtonStyle.Secondary);

                const recensione5 = new ButtonBuilder()

                .setCustomId(`rec_5_${interaction.user.id}`)

                .setLabel('⭐⭐⭐⭐⭐')

                .setStyle(ButtonStyle.Success);

                return interaction.reply({

                    embeds: [

                        new EmbedBuilder()

                        .setColor('Blue')

                        .setTitle('✅ CORSA TERMINATA')

                        .setDescription(
                            'Lascia una recensione al driver'
                        )
                    ],

                    components: [

                        new ActionRowBuilder()

                        .addComponents(
                            recensione1,
                            recensione2,
                            recensione3,
                            recensione4,
                            recensione5
                        )
                    ]
                });
            }

            // ================= SHIFT STATS =================
            if (interaction.commandName === 'shift-stats') {

                const lista = await Shift.find();

                if (!lista.length)

                    return interaction.reply('❌ Nessun dato');

                const testo = lista.map(x => {

                    let tempo = x.tempo;

                    if (x.inShift)
                        tempo += Date.now() - x.start;

                    const ore =
                    (tempo / 3600000).toFixed(1);

                    let pex = '❌ Depex';

                    if (ore >= 8)
                        pex = '✅ Pex Assicurato';

                    else if (ore >= 5)
                        pex = '⚠️ Possibile Pex';

                    return `
👤 <@${x.userId}>
⏱️ ${ore}h
🚖 Corse: ${x.corse}
📌 Stato: ${x.stato}
${pex}
`;
                }).join('\n');

                return interaction.reply({

                    embeds: [

                        new EmbedBuilder()

                        .setColor('Blue')

                        .setTitle('📊 STATISTICHE SHIFT')

                        .setDescription(testo)
                    ]
                });
            }
            // ================= LEADERBOARD =================
            if (interaction.commandName === 'leaderboard') {

                const top =
                await Shift.find()
                .sort({ corse: -1 })
                .limit(10);

                if (!top.length)

                    return interaction.reply('❌ Nessun dato');

                const testo = top.map((x, i) => {

                    let media = 0;

                    if (x.recensioni.length)

                        media = (
                            x.recensioni.reduce((a, b) => a + b, 0)
                            / x.recensioni.length
                        ).toFixed(1);

                    return `
#${i + 1} <@${x.userId}>
🚖 Corse: ${x.corse}
⭐ Media: ${media}
`;
                }).join('\n');

                return interaction.reply({

                    embeds: [

                        new EmbedBuilder()

                        .setColor('Gold')

                        .setTitle('🏆 LEADERBOARD TAXISTI')

                        .setDescription(testo)
                    ]
                });
            }

            // ================= TAXI ROULETTE =================
            if (interaction.commandName === 'taxi-roulette') {

                if (!isStaff)

                    return interaction.reply({

                        content: '❌ No permessi',

                        ephemeral: true
                    });

                const drivers =
                await Shift.find({
                    inShift: true
                });

                if (!drivers.length)

                    return interaction.reply(
                        '❌ Nessun driver disponibile'
                    );

                const scelto =
                drivers[Math.floor(Math.random() * drivers.length)];

                return interaction.reply({

                    embeds: [

                        new EmbedBuilder()

                        .setColor('Purple')

                        .setTitle('🎲 TAXI ROULETTE')

                        .setDescription(
                            `🚖 Driver scelto: <@${scelto.userId}>`
                        )
                    ]
                });
            }

            // ================= BLACKLIST =================
            if (interaction.commandName === 'blacklist') {

                if (!isStaff)

                    return interaction.reply({

                        content: '❌ No permessi',

                        ephemeral: true
                    });

                const user =
                interaction.options.getUser('utente');

                const motivo =
                interaction.options.getString('motivo');

                await Blacklist.create({

                    userId: user.id,
                    motivo
                });

                return interaction.reply({

                    embeds: [

                        new EmbedBuilder()

                        .setColor('Red')

                        .setTitle('🚫 UTENTE BLACKLISTATO')

                        .setDescription(
                            `${user} non può più chiamare taxi`
                        )

                        .addFields({
                            name: '📝 Motivo',
                            value: motivo
                        })
                    ]
                });
            }

            // ================= UNBLACKLIST =================
            if (interaction.commandName === 'unblacklist') {

                if (!isStaff)

                    return interaction.reply({

                        content: '❌ No permessi',

                        ephemeral: true
                    });

                const user =
                interaction.options.getUser('utente');

                await Blacklist.deleteOne({

                    userId: user.id
                });

                return interaction.reply({

                    embeds: [

                        new EmbedBuilder()

                        .setColor('Green')

                        .setTitle('✅ BLACKLIST RIMOSSA')

                        .setDescription(
                            `${user} può usare di nuovo il taxi`
                        )
                    ]
                });
            }

            // ================= SANZIONI =================
            if (interaction.commandName === 'sanziona') {

                if (!isStaff)

                    return interaction.reply({

                        content: '❌ No permessi',

                        ephemeral: true
                    });

                const user =
                interaction.options.getUser('utente');

                const tipo =
                interaction.options.getString('tipo');

                const motivo =
                interaction.options.getString('motivo');

                const durata =
                interaction.options.getString('durata')
                || 'Non specificata';

                let dati =
                await Sanzioni.findOne({

                    userId: user.id
                });

                if (!dati)

                    dati = new Sanzioni({

                        userId: user.id
                    });

                // ================= WARN =================
                if (tipo === 'warn') {

                    dati.warn += 1;

                    if (dati.warn >= 3) {

                        dati.warn = 0;

                        dati.strike += 1;
                    }
                }

                // ================= STRIKE =================
                if (tipo === 'strike') {

                    dati.strike += 1;
                }

                await dati.save();

                let finale = tipo;

                if (dati.strike >= 5) {

                    finale = 'LICENZIAMENTO AUTOMATICO';
                }

                const embed = new EmbedBuilder()

                .setColor('Red')

                .setTitle('⚠️ SANZIONE TAXISTA')

                .addFields(

                    {
                        name: '👤 Taxista',
                        value: `${user}`
                    },

                    {
                        name: '📌 Tipo',
                        value: finale
                    },

                    {
                        name: '📝 Motivo',
                        value: motivo
                    },

                    {
                        name: '⏳ Durata',
                        value: durata
                    },

                    {
                        name: '⚠️ Warn',
                        value: `${dati.warn}`
                    },

                    {
                        name: '🚨 Strike',
                        value: `${dati.strike}`
                    }
                )

                .setTimestamp();

                return interaction.reply({

                    embeds: [embed]
                });
            }

            // ================= RESET SHIFT =================
            if (interaction.commandName === 'reset-shift') {

                if (!isOwner)

                    return interaction.reply({

                        content: '❌ Solo owner',

                        ephemeral: true
                    });

                await Shift.deleteMany({});

                return interaction.reply({

                    embeds: [

                        new EmbedBuilder()

                        .setColor('Orange')

                        .setTitle('♻️ SHIFT RESETTATI')

                        .setDescription(
                            'Tutti gli shift sono stati azzerati'
                        )
                    ]
                });
            }
        }

        // ================= BUTTONS =================
        if (interaction.isButton()) {

            // ================= CHIAMA TAXI =================
            if (interaction.customId === 'chiama_taxi') {

                const black =
                await Blacklist.findOne({

                    userId: interaction.user.id
                });

                if (black)

                    return interaction.reply({

                        content:
                        `🚫 Sei blacklistato\nMotivo: ${black.motivo}`,

                        ephemeral: true
                    });

                // ================= COOLDOWN =================
                if (cooldownTaxi.has(interaction.user.id)) {

                    return interaction.reply({

                        content:
                        '⏳ Aspetta prima di richiamare un taxi',

                        ephemeral: true
                    });
                }

                cooldownTaxi.set(interaction.user.id, true);

                setTimeout(() => {

                    cooldownTaxi.delete(interaction.user.id);

                }, 60000);

                const modal = new ModalBuilder()

                .setCustomId('taxi_modal')

                .setTitle('🚖 Richiesta Taxi');

                modal.addComponents(

                    new ActionRowBuilder()

                    .addComponents(

                        new TextInputBuilder()

                        .setCustomId('nome')

                        .setLabel('Nome Roblox')

                        .setStyle(TextInputStyle.Short)

                        .setRequired(true)
                    ),

                    new ActionRowBuilder()

                    .addComponents(

                        new TextInputBuilder()

                        .setCustomId('posizione')

                        .setLabel('Posizione Attuale')

                        .setStyle(TextInputStyle.Short)

                        .setRequired(true)
                    ),

                    new ActionRowBuilder()

                    .addComponents(

                        new TextInputBuilder()

                        .setCustomId('destinazione')

                        .setLabel('Destinazione')

                        .setStyle(TextInputStyle.Short)

                        .setRequired(true)
                    )
                );

                return interaction.showModal(modal);
            }
            // ================= ACCETTA CORSA =================
            if (interaction.customId.startsWith('accetta_')) {

                const corsaId =
                interaction.customId.split('_')[1];

                const corsa =
                await Corsa.findById(corsaId);

                if (!corsa)

                    return interaction.reply({

                        content: '❌ Corsa non trovata',

                        ephemeral: true
                    });

                if (corsa.driverId)

                    return interaction.reply({

                        content: '❌ Corsa già presa',

                        ephemeral: true
                    });

                // ================= SOLO DRIVER =================
                if (
                    !interaction.member.roles.cache.has(
                        DRIVER_ROLE_ID
                    )
                ) {

                    return interaction.reply({

                        content: '❌ Non sei un taxista',

                        ephemeral: true
                    });
                }

                corsa.driverId = interaction.user.id;

                await corsa.save();

                driverOccupati.add(interaction.user.id);

                let data =
                await Shift.findOne({

                    userId: interaction.user.id
                });

                if (data) {

                    data.stato = 'Occupato';

                    data.corse += 1;

                    await data.save();
                }

                const embed =
                EmbedBuilder.from(
                    interaction.message.embeds[0]
                )

                .setColor('Green')

                .addFields({

                    name: '🚖 Driver',

                    value: `${interaction.user}`
                });

                await interaction.message.edit({

                    embeds: [embed],

                    components: []
                });

                const logChannel =
                await client.channels.fetch(LOG_CHANNEL_ID);

                await logChannel.send({

                    embeds: [

                        new EmbedBuilder()

                        .setColor('Green')

                        .setTitle('🚖 CORSA ACCETTATA')

                        .addFields(

                            {
                                name: '👤 Cliente',
                                value: `<@${corsa.clienteId}>`
                            },

                            {
                                name: '🚖 Driver',
                                value: `${interaction.user}`
                            }
                        )

                        .setTimestamp()
                    ]
                });

                return interaction.reply({

                    content: '✅ Hai accettato la corsa',

                    ephemeral: true
                });
            }

            // ================= RECENSIONI =================
            if (interaction.customId.startsWith('rec_')) {

                const dati =
                interaction.customId.split('_');

                const stelle =
                parseInt(dati[1]);

                const driverId =
                dati[2];

                let driver =
                await Shift.findOne({

                    userId: driverId
                });

                if (driver) {

                    driver.recensioni.push(stelle);

                    await driver.save();
                }

                return interaction.reply({

                    content:
                    `⭐ Hai lasciato ${stelle} stelle`,

                    ephemeral: true
                });
            }
        }

        // ================= MODAL =================
        if (interaction.isModalSubmit()) {

            // ================= MODAL TAXI =================
            if (interaction.customId === 'taxi_modal') {

                const nome =
                interaction.fields.getTextInputValue('nome');

                const posizione =
                interaction.fields.getTextInputValue('posizione');

                const destinazione =
                interaction.fields.getTextInputValue('destinazione');

                // ================= CREA CORSA =================
                const corsa =
                await Corsa.create({

                    clienteId: interaction.user.id,

                    nome,
                    posizione,
                    destinazione
                });

                const button =
                new ButtonBuilder()

                .setCustomId(`accetta_${corsa._id}`)

                .setLabel('✅ Accetta Corsa')

                .setStyle(ButtonStyle.Success);

                const embed =
                new EmbedBuilder()

                .setColor('Orange')

                .setTitle('🚖 NUOVA CORSA')

                .addFields(

                    {
                        name: '👤 Cliente',
                        value: `${interaction.user}`
                    },

                    {
                        name: '🎮 Nome Roblox',
                        value: nome
                    },

                    {
                        name: '📍 Posizione',
                        value: posizione
                    },

                    {
                        name: '🏁 Destinazione',
                        value: destinazione
                    }
                )

                .setFooter({
                    text: 'Premi il bottone per accettare'
                })

                .setTimestamp();

                const taxiChannel =
                await client.channels.fetch(
                    TAXI_CHANNEL_ID
                );

                const logChannel =
                await client.channels.fetch(
                    LOG_CHANNEL_ID
                );

                // ================= INVIO TAXI =================
                await taxiChannel.send({

                    content:
                    `<@&${DRIVER_ROLE_ID}> 🚖 Nuova corsa`,

                    embeds: [embed],

                    components: [

                        new ActionRowBuilder()

                        .addComponents(button)
                    ]
                });

                // ================= LOG =================
                await logChannel.send({

                    embeds: [

                        new EmbedBuilder()

                        .setColor('Blue')

                        .setTitle('📥 NUOVA RICHIESTA TAXI')

                        .addFields(

                            {
                                name: '👤 Cliente',
                                value: `${interaction.user}`
                            },

                            {
                                name: '📍 Posizione',
                                value: posizione
                            },

                            {
                                name: '🏁 Destinazione',
                                value: destinazione
                            }
                        )

                        .setTimestamp()
                    ]
                });

                return interaction.reply({

                    content:
                    '✅ Taxi chiamato con successo',

                    ephemeral: true
                });
            }
        }

    } catch (err) {

        console.log(err);

        if (!interaction.replied)

            interaction.reply({

                content: '❌ Errore interno',

                ephemeral: true
            });
    }
});
// ================= LOGIN =================
client.login(process.env.TOKEN);
