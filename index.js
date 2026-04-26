const {
    Client,
    GatewayIntentBits,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle
} = require('discord.js');

const mongoose = require('mongoose');
const express = require('express');

const app = express();

// 🌐 KEEP ALIVE (Render)
app.get('/', (req, res) => {
    res.send('Bot taxi attivo 🚖');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🌐 Keep alive attivo su porta ${PORT}`);
});

// 🔥 CONFIG (I TUOI ID)
const STAFF_ROLE_ID = "1455329952395296901";
const DRIVER_ROLE_ID = "1455329847122591918";
const TAXI_CHANNEL_ID = "1455213769348350055";
const LOG_CHANNEL_ID = "1497716230130368642";
const PANEL_CHANNEL_ID = "1497717183231557793";
const OWNER_ROLE_ID = "1489313212586524742";

const client = new Client({
    intents: [GatewayIntentBits.Guilds]
});

// 🔗 MONGODB
mongoose.connect(process.env.MONGO_URI)
.then(() => console.log('✅ MongoDB connesso'))
.catch(err => console.log(err));

// 🧠 SHIFT SCHEMA
const shiftSchema = new mongoose.Schema({
    userId: String,
    tempo: { type: Number, default: 0 },
    inShift: { type: Boolean, default: false },
    pausa: { type: Boolean, default: false },
    start: { type: Number, default: 0 }
});

const Shift = mongoose.model('Shift', shiftSchema);

// 🚕 DRIVER
let driverOccupati = new Set();

client.once('ready', () => {
    console.log(`✅ Online come ${client.user.tag}`);
});

// ================= INTERAZIONI =================
client.on('interactionCreate', async interaction => {

    // ===== SLASH =====
    if (interaction.isChatInputCommand()) {

        const isStaff = interaction.member.roles.cache.has(STAFF_ROLE_ID);
        const isDriver = interaction.member.roles.cache.has(DRIVER_ROLE_ID);
        const isOwner = interaction.member.roles.cache.has(OWNER_ROLE_ID);

        // 🚖 PANNELLO
        if (interaction.commandName === 'pannello-taxi') {

            if (!isStaff)
                return interaction.reply({ content: '❌ No permessi.', ephemeral: true });

            const button = new ButtonBuilder()
                .setCustomId('chiama_taxi')
                .setLabel('🚖 Chiama Taxi')
                .setStyle(ButtonStyle.Primary);

            const channel = await client.channels.fetch(PANEL_CHANNEL_ID);

            await channel.send({
                embeds: [
                    new EmbedBuilder()
                        .setColor('Yellow')
                        .setTitle('🚖 CENTRALE TAXI')
                        .setDescription('Premi per richiedere un taxi')
                ],
                components: [new ActionRowBuilder().addComponents(button)]
            });

            return interaction.reply({ content: '✅ Pannello inviato.', ephemeral: true });
        }

        // ===== SHIFT =====

        if (interaction.commandName === 'entra-shift') {

            if (!isDriver)
                return interaction.reply({ content: '❌ Non sei taxista.', ephemeral: true });

            let data = await Shift.findOne({ userId: interaction.user.id });
            if (!data) data = new Shift({ userId: interaction.user.id });

            data.inShift = true;
            data.pausa = false;
            data.start = Date.now();

            await data.save();

            return interaction.reply('✅ Entrato in servizio');
        }

        if (interaction.commandName === 'esci-shift') {

            let data = await Shift.findOne({ userId: interaction.user.id });

            if (!data || !data.inShift)
                return interaction.reply({ content: '❌ Non sei in shift.', ephemeral: true });

            if (!data.pausa)
                data.tempo += Date.now() - data.start;

            data.inShift = false;
            driverOccupati.delete(interaction.user.id);

            await data.save();

            return interaction.reply('❌ Uscito dal servizio');
        }

        if (interaction.commandName === 'fine-corsa') {

            if (!driverOccupati.has(interaction.user.id))
                return interaction.reply({ content: '❌ Nessuna corsa.', ephemeral: true });

            driverOccupati.delete(interaction.user.id);

            return interaction.reply({
                embeds: [
                    new EmbedBuilder()
                        .setColor('Green')
                        .setTitle('🚕 CORSA TERMINATA')
                        .addFields(
                            { name: 'Driver', value: `${interaction.user}` },
                            { name: 'Stato', value: '✅ Disponibile' }
                        )
                ]
            });
        }

        if (interaction.commandName === 'shift-stats') {

            let lista = await Shift.find();

            if (!lista.length)
                return interaction.reply('❌ Nessun dato.');

            let testo = lista.map(data => {

                let tempo = data.tempo;

                if (data.inShift && !data.pausa)
                    tempo += Date.now() - data.start;

                let ore = (tempo / 3600000).toFixed(1);

                let stato = '❌ Depex';
                if (ore >= 5) stato = '⚠️ Possibile Pex';
                if (ore >= 8) stato = '✅ Pex assicurato';

                return `<@${data.userId}> → ${ore}h → ${stato}`;
            }).join('\n');

            return interaction.reply({
                embeds: [
                    new EmbedBuilder()
                        .setColor('Blue')
                        .setTitle('📊 SHIFT TAXI')
                        .setDescription(testo)
                ]
            });
        }

        // ===== RESET =====
        if (interaction.commandName === 'reset-shift') {

            if (!isOwner)
                return interaction.reply({ content: '❌ Solo dirigenza.', ephemeral: true });

            await Shift.deleteMany({});

            return interaction.reply('♻️ Shift resettati.');
        }
    }

    // ===== MODAL =====
    if (interaction.isModalSubmit()) {

        let drivers = await Shift.find({ inShift: true, pausa: false });

        if (drivers.length === 0)
            return interaction.reply({ content: '❌ Nessun driver disponibile.', ephemeral: true });

        let disponibile = drivers.find(d => !driverOccupati.has(d.userId));

        if (!disponibile)
            return interaction.reply({ content: '❌ Tutti occupati.', ephemeral: true });

        driverOccupati.add(disponibile.userId);

        const embed = new EmbedBuilder()
            .setColor('Green')
            .setTitle('🚖 CORSA ASSEGNATA')
            .addFields(
                { name: 'Cliente', value: `${interaction.user}` },
                { name: 'Driver', value: `<@${disponibile.userId}>` },
                { name: 'Stato', value: '🚫 Occupato' }
            )
            .setTimestamp();

        const taxiChannel = await client.channels.fetch(TAXI_CHANNEL_ID);
        const logChannel = await client.channels.fetch(LOG_CHANNEL_ID);

        await taxiChannel.send({
            content: `<@&${DRIVER_ROLE_ID}> 🚖 Nuova corsa!`,
            embeds: [embed]
        });

        await logChannel.send({ embeds: [embed] });

        return interaction.reply({ content: '✅ Taxi chiamato', ephemeral: true });
    }

    // ===== BOTTONE =====
    if (interaction.isButton()) {

        if (interaction.customId === 'chiama_taxi') {

            const modal = new ModalBuilder()
                .setCustomId('modulo_taxi')
                .setTitle('Richiesta Taxi');

            modal.addComponents(
                new ActionRowBuilder().addComponents(
                    new TextInputBuilder()
                        .setCustomId('nome')
                        .setLabel('Nome Roblox')
                        .setStyle(TextInputStyle.Short)
                )
            );

            return interaction.showModal(modal);
        }
    }
});

client.login(process.env.TOKEN);