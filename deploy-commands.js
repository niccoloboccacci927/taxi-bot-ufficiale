const { REST, Routes, SlashCommandBuilder } = require('discord.js');

const commands = [

    // 🚖 PANNELLO
    new SlashCommandBuilder()
        .setName('pannello-taxi')
        .setDescription('Invia il pannello taxi'),

    // ⏱️ SHIFT
    new SlashCommandBuilder()
        .setName('entra-shift')
        .setDescription('Entra in servizio'),

    new SlashCommandBuilder()
        .setName('esci-shift')
        .setDescription('Esci dal servizio'),

    new SlashCommandBuilder()
        .setName('fine-corsa')
        .setDescription('Termina la corsa attuale'),

    new SlashCommandBuilder()
        .setName('shift-stats')
        .setDescription('Visualizza le statistiche shift'),

    // 👑 DIRIGENZA
    new SlashCommandBuilder()
        .setName('reset-shift')
        .setDescription('Resetta tutti gli shift')

].map(cmd => cmd.toJSON());

const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);

// ⚠️ METTI IL TUO CLIENT ID
const CLIENT_ID = "METTI_IL_TUO_CLIENT_ID";

(async () => {
    try {
        console.log('⏳ Deploy comandi...');

        await rest.put(
            Routes.applicationCommands(CLIENT_ID),
            { body: commands }
        );

        console.log('✅ Comandi registrati!');
    } catch (error) {
        console.error(error);
    }
})();