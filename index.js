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
    REST,
    Routes,
    SlashCommandBuilder
} = require('discord.js');

const mongoose = require('mongoose');
const express = require('express');

// ===== CLIENT =====
const client = new Client({
    intents: [GatewayIntentBits.Guilds]
});

// ===== KEEP ALIVE (Render) =====
const app = express();
app.get('/', (req, res) => res.send('Bot taxi attivo 🚖'));
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🌐 Server attivo su ${PORT}`));

// ===== CONFIG =====
const STAFF_ROLE_ID = "1455329952395296901";
const DRIVER_ROLE_ID = "1455329847122591918";
const TAXI_CHANNEL_ID = "1455213769348350055";
const LOG_CHANNEL_ID = "1497716230130368642";
const PANEL_CHANNEL_ID = "1497717183231557793";
const OWNER_ROLE_ID = "1489313212586524742";

// ===== MONGO =====
mongoose.connect(process.env.MONGO_URI)
.then(() => console.log('✅ MongoDB connesso'))
.catch(err => console.error('❌ Mongo error:', err));

// ===== SCHEMA =====
const shiftSchema = new mongoose.Schema({
    userId: String,
    tempo: { type: Number, default: 0 },
    inShift: { type: Boolean, default: false },
    start: { type: Number, default: 0 }
});
const Shift = mongoose.model('Shift', shiftSchema);

let driverOccupati = new Set();

// ===== READY + DEPLOY COMMANDS =====
client.once('ready', async () => {
    console.log(`✅ Online come ${client.user.tag}`);

    const commands = [
        new SlashCommandBuilder().setName('pannello-taxi').setDescription('Invia pannello taxi'),
        new SlashCommandBuilder().setName('entra-shift').setDescription('Entra in servizio'),
        new SlashCommandBuilder().setName('esci-shift').setDescription('Esci dal servizio'),
        new SlashCommandBuilder().setName('fine-corsa').setDescription('Termina corsa'),
        new SlashCommandBuilder().setName('shift-stats').setDescription('Mostra statistiche'),
        new SlashCommandBuilder().setName('reset-shift').setDescription('Resetta tutto')
    ].map(c => c.toJSON());

    const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);

    try {
        console.log('⏳ Registro comandi...');
        await rest.put(
            Routes.applicationGuildCommands(
                process.env.CLIENT_ID,
                process.env.GUILD_ID
            ),
            { body: commands }
        );
        console.log('✅ Comandi pronti');
    } catch (e) {
        console.error('❌ Deploy error:', e);
    }
});

// ===== INTERAZIONI =====
client.on('interactionCreate', async (interaction) => {
    try {

        // ===== SLASH =====
        if (interaction.isChatInputCommand()) {

            const isStaff = interaction.member.roles.cache.has(STAFF_ROLE_ID);
            const isDriver = interaction.member.roles.cache.has(DRIVER_ROLE_ID);
            const isOwner = interaction.member.roles.cache.has(OWNER_ROLE_ID);

            // PANNELLO
            if (interaction.commandName === 'pannello-taxi') {
                if (!isStaff) return interaction.reply({ content: '❌ No permessi', ephemeral: true });

                const button = new ButtonBuilder()
                    .setCustomId('chiama_taxi')
                    .setLabel('🚖 Chiama Taxi')
                    .setStyle(ButtonStyle.Primary);

                const ch = await client.channels.fetch(PANEL_CHANNEL_ID);

                await ch.send({
                    embeds: [
                        new EmbedBuilder()
                            .setColor('Yellow')
                            .setTitle('🚖 CENTRALE TAXI')
                            .setDescription('Premi per richiedere un taxi')
                    ],
                    components: [new ActionRowBuilder().addComponents(button)]
                });

                return interaction.reply({ content: '✅ Pannello inviato', ephemeral: true });
            }

            // ENTRA SHIFT
            if (interaction.commandName === 'entra-shift') {
                if (!isDriver) return interaction.reply({ content: '❌ Non sei taxista', ephemeral: true });

                let d = await Shift.findOne({ userId: interaction.user.id }) || new Shift({ userId: interaction.user.id });

                d.inShift = true;
                d.start = Date.now();
                await d.save();

                return interaction.reply('✅ In servizio');
            }

            // ESCI SHIFT
            if (interaction.commandName === 'esci-shift') {
                let d = await Shift.findOne({ userId: interaction.user.id });

                if (!d || !d.inShift)
                    return interaction.reply({ content: '❌ Non sei in shift', ephemeral: true });

                d.tempo += Date.now() - d.start;
                d.inShift = false;
                driverOccupati.delete(interaction.user.id);

                await d.save();

                return interaction.reply('❌ Fuori servizio');
            }

            // FINE CORSA
            if (interaction.commandName === 'fine-corsa') {
                if (!driverOccupati.has(interaction.user.id))
                    return interaction.reply({ content: '❌ Non sei in corsa', ephemeral: true });

                driverOccupati.delete(interaction.user.id);

                return interaction.reply('🚕 Ora sei disponibile');
            }

            // STATS
            if (interaction.commandName === 'shift-stats') {
                let lista = await Shift.find();

                if (!lista.length)
                    return interaction.reply('❌ Nessun dato');

                let txt = lista.map(d => {
                    let tempo = d.tempo;
                    if (d.inShift) tempo += Date.now() - d.start;

                    let ore = (tempo / 3600000).toFixed(1);
                    return `<@${d.userId}> → ${ore}h`;
                }).join('\n');

                return interaction.reply({
                    embeds: [new EmbedBuilder()
                        .setColor('Blue')
                        .setTitle('📊 Shift')
                        .setDescription(txt)]
                });
            }

            // RESET
            if (interaction.commandName === 'reset-shift') {
                if (!isOwner) return interaction.reply({ content: '❌ Solo owner', ephemeral: true });

                await Shift.deleteMany({});
                return interaction.reply('♻️ Reset fatto');
            }
        }

        // ===== BUTTON =====
        if (interaction.isButton()) {
            if (interaction.customId === 'chiama_taxi') {

                const modal = new ModalBuilder()
                    .setCustomId('taxi_modal')
                    .setTitle('Richiesta Taxi');

                modal.addComponents(
                    new ActionRowBuilder().addComponents(
                        new TextInputBuilder()
                            .setCustomId('nome')
                            .setLabel('Nome Roblox')
                            .setStyle(TextInputStyle.Short)
                    ),
                    new ActionRowBuilder().addComponents(
                        new TextInputBuilder()
                            .setCustomId('posizione')
                            .setLabel('Posizione')
                            .setStyle(TextInputStyle.Short)
                    ),
                    new ActionRowBuilder().addComponents(
                        new TextInputBuilder()
                            .setCustomId('destinazione')
                            .setLabel('Destinazione')
                            .setStyle(TextInputStyle.Short)
                    )
                );

                return interaction.showModal(modal);
            }
        }

        // ===== MODAL =====
        if (interaction.isModalSubmit()) {

            if (interaction.customId !== 'taxi_modal') return;

            const nome = interaction.fields.getTextInputValue('nome');
            const posizione = interaction.fields.getTextInputValue('posizione');
            const destinazione = interaction.fields.getTextInputValue('destinazione');

            let drivers = await Shift.find({ inShift: true });
            let libero = drivers.find(d => !driverOccupati.has(d.userId));

            if (!libero)
                return interaction.reply({ content: '❌ Nessun driver disponibile', ephemeral: true });

            driverOccupati.add(libero.userId);

            const embed = new EmbedBuilder()
                .setColor('Green')
                .setTitle('🚖 NUOVA CORSA')
                .addFields(
                    { name: 'Cliente', value: `${interaction.user}` },
                    { name: 'Nome Roblox', value: nome },
                    { name: 'Posizione', value: posizione },
                    { name: 'Destinazione', value: destinazione },
                    { name: 'Driver', value: `<@${libero.userId}>` }
                )
                .setTimestamp();

            const taxiCh = await client.channels.fetch(TAXI_CHANNEL_ID);
            const logCh = await client.channels.fetch(LOG_CHANNEL_ID);

            await taxiCh.send({
                content: `<@&${DRIVER_ROLE_ID}> 🚖 Nuova corsa`,
                embeds: [embed]
            });

            await logCh.send({ embeds: [embed] });

            return interaction.reply({ content: '✅ Taxi chiamato', ephemeral: true });
        }

    } catch (err) {
        console.error('❌ ERRORE:', err);

        if (!interaction.replied) {
            interaction.reply({ content: '❌ Errore interno', ephemeral: true });
        }
    }
});

client.login(process.env.TOKEN);