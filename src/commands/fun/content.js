import { MessageFlags, SlashCommandBuilder } from 'discord.js';

import { brand } from '../../config/brand.js';
import { renderMeme } from '../../services/ai.js';
import { checkFun, markFun } from '../../services/progression.js';
import { errorEmbed, webEmbed } from '../../utils/embeds.js';
import { explainError } from '../../utils/errors.js';

/**
 * Real content, written for this bot: jokes, roasts, compliments, quotes,
 * truths and dares. /meme renders an actual image through the verified
 * /imagecreator/meme endpoint.
 */

export const JOKES = [
  'I tried to make a spider joke, but it got tangled in the delivery. 🕸️',
  'Why do spiders make terrible liars? Because you can always see the web of lies.',
  'I asked the web for advice. It said: hang in there.',
  'My spider plant died. I think it was lonely.',
  'Two spiders opened a restaurant. The reviews said the service was a bit sticky.',
  'I am reading a book about spiders. It has a lot of hanging plot threads.',
  'A spider walked into a bar. The bartender said: we do not serve your kind. The spider said: why not? I am a web designer.',
  'Why did the spider cross the road? To get to the other web.',
  'I have trust issues. My last partner was a black widow.',
  'The web is down. Literally. Something walked through it.',
  'My room is spotless. The spiders and I came to an arrangement.',
  'Do not be afraid of spiders. They eat the bugs that actually annoy you.',
  'I named my spider NIGHTMARE. Now nobody uses my chair.',
  'I am not saying I am a spider. I am saying I relate to the web.',
];

export const ROASTS = [
  'You have the energy of a spider that built its web in a doorway.',
  'You are like a broken strand — technically part of the web, mostly just hanging.',
  'You bring the chaos of a moth to a web convention.',
  'You are the kind of person who walks into the web and blames the spider.',
  'Your plans have the structural integrity of wet silk.',
  'You are proof that the web lets anyone in these days.',
  'You have main character energy inside a footnote.',
  'You are the reason the web needs a support group.',
  'You are not lost in the shadows. You are just standing very still.',
  'You are one clever idea away from being dangerous. That is a long way.',
  'You are the loading screen of the spider world — always spinning, never arriving.',
  'You are 90% confidence and 10% web.',
];

export const COMPLIMENTS = [
  'You have the patience of a spider repairing a broken web at midnight.',
  'You make the dark easier to be in.',
  'Your ideas are strong enough to hold weight.',
  'You notice things other people walk straight through.',
  'You are the calm strand in a loud web.',
  'You handle chaos like it asked you first.',
  'You make the server better just by speaking in it.',
  'You have excellent instincts. The web agrees.',
  'You are the reason someone here stayed another day.',
  'You bring real warmth to a very dark place.',
  'You are sharp, and you use it kindly.',
  'You are quietly one of the strongest people in this web.',
];

export const QUOTES = [
  'The web does not ask permission. It just grows.',
  'Silence is not absence. It is patience.',
  'Everything tangled can be re-woven.',
  'Small strands hold heavy things.',
  'The dark is not empty. It is unwatched.',
  'A web is a promise that something cares enough to wait.',
  'Fear the quiet. That is where the work happens.',
  'You are allowed to take up space in the dark.',
  'Strength is a pattern, not a moment.',
  'Nobody survives the web alone. They just think they do.',
  'The thread you think is a trap may be your way out.',
  'Patience outlasts almost everything.',
];

export const TRUTHS = [
  'What is the last thing you searched for at 3am?',
  'Who in this server would you trust with your password, and why?',
  'What is a compliment you have never said out loud to someone here?',
  'What is the pettiest reason you have ever been annoyed at someone?',
  'If you had to delete one app forever, which one goes?',
  'What is the most embarrassing thing you have said in a voice call?',
  'What is the biggest lie you have told to get out of plans?',
  'Who was your first online friend, and do you still talk?',
  'What is something you pretend to understand but really do not?',
  'What is the nicest thing you have ever done without telling anyone?',
  'What song do you play when nobody is listening?',
  'What is your most useless talent?',
  'Which member here would you want on your team in a crisis?',
  'What is the last thing you cried watching, if anything?',
];

export const DARES = [
  'Send a message using only emojis for the next five minutes.',
  'Type your next reply in ALL CAPS because NIGHTMARE demands it.',
  'Compliment the next person who speaks in this channel.',
  'Change your nickname to 🕸️ Web Victim for one hour.',
  'Send the last photo in your camera roll — describe it if you refuse to post it.',
  'Say something nice about the member above you in this channel.',
  'Write a two-line poem about this server.',
  'Speak like a spider for your next three messages.',
  'Give a heartfelt compliment to the last person who used /fun.',
  'React to the next ten messages with only 🕷️.',
  'Post the most dramatic sentence you can invent about your day.',
  'Answer the next question anyone in this server asks, truthfully.',
];

export const pickRandom = (list) => list[Math.floor(Math.random() * list.length)];

function blocked(interaction, check) {
  return interaction.reply({ embeds: [errorEmbed('Cooldown', check.message)], flags: MessageFlags.Ephemeral });
}

async function contentCommand(interaction, { label, emoji, list }) {
  const check = checkFun(interaction.user.id, `/${label}`);
  if (!check.ok) return blocked(interaction, check);
  markFun(interaction.user.id);
  return interaction.reply({ embeds: [webEmbed({ title: `${emoji} ${label}`, description: pickRandom(list), color: brand.colors.primary })] });
}

async function targetedCommand(interaction, { label, emoji, list }) {
  const target = interaction.options.getUser('user') ?? interaction.user;
  const check = checkFun(interaction.user.id, `/${label}`);
  if (!check.ok) return blocked(interaction, check);
  markFun(interaction.user.id);
  return interaction.reply({
    embeds: [
      webEmbed({
        title: `${emoji} ${label} — ${target.username}`,
        description: `${target}\n\n${pickRandom(list)}`,
        color: brand.colors.primary,
        thumbnail: target.displayAvatarURL({ size: 128 }),
      }),
    ],
    allowedMentions: { parse: [] },
  });
}

const joke = {
  data: new SlashCommandBuilder().setName('joke').setDescription('A joke from the dark side of the web'),
  async run(interaction) {
    return contentCommand(interaction, { label: 'joke', emoji: '😂', list: JOKES });
  },
};

const quote = {
  data: new SlashCommandBuilder().setName('quote').setDescription('A line worth remembering'),
  async run(interaction) {
    return contentCommand(interaction, { label: 'quote', emoji: '🕸️', list: QUOTES });
  },
};

const truth = {
  data: new SlashCommandBuilder().setName('truth').setDescription('A truth question you have to answer'),
  async run(interaction) {
    return contentCommand(interaction, { label: 'truth', emoji: '🌑', list: TRUTHS });
  },
};

const dare = {
  data: new SlashCommandBuilder().setName('dare').setDescription('A dare you have to accept'),
  async run(interaction) {
    return contentCommand(interaction, { label: 'dare', emoji: '🔥', list: DARES });
  },
};

const roast = {
  data: new SlashCommandBuilder()
    .setName('roast')
    .setDescription('Roast someone — playfully')
    .addUserOption((option) => option.setName('user').setDescription('Who to roast (defaults to you)').setRequired(false)),
  async run(interaction) {
    return targetedCommand(interaction, { label: 'roast', emoji: '🔥', list: ROASTS });
  },
};

const compliment = {
  data: new SlashCommandBuilder()
    .setName('compliment')
    .setDescription('Compliment someone')
    .addUserOption((option) => option.setName('user').setDescription('Who to compliment (defaults to you)').setRequired(false)),
  async run(interaction) {
    return targetedCommand(interaction, { label: 'compliment', emoji: '💜', list: COMPLIMENTS });
  },
};

const meme = {
  data: new SlashCommandBuilder()
    .setName('meme')
    .setDescription('Render your own meme image through the Prexzy renderer')
    .addStringOption((option) => option.setName('top').setDescription('Top text').setRequired(true).setMaxLength(120))
    .addStringOption((option) => option.setName('bottom').setDescription('Bottom text').setRequired(false).setMaxLength(120)),
  async run(interaction) {
    const check = checkFun(interaction.user.id, '/meme', 15000);
    if (!check.ok) return blocked(interaction, check);

    await interaction.deferReply();
    try {
      const media = await renderMeme({
        topText: interaction.options.getString('top'),
        bottomText: interaction.options.getString('bottom') ?? '',
      });
      markFun(interaction.user.id);
      return interaction.editReply({
        embeds: [
          webEmbed({
            title: '🕸️ Member-made meme',
            description: `Rendered live for ${interaction.user}`,
            image: `attachment://${media.name}`,
            color: brand.colors.primary,
          }),
        ],
        files: [{ attachment: media.buffer, name: media.name }],
      });
    } catch (error) {
      return interaction.editReply({
        embeds: [errorEmbed('The meme renderer did not answer', `${explainError(error)} — I am not posting a broken image, try again in a moment.`)],
      });
    }
  },
};

export default [joke, roast, compliment, quote, truth, dare, meme];
