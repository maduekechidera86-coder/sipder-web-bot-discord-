import { MessageFlags, SlashCommandBuilder } from 'discord.js';

import { brand } from '../config/brand.js';
import {
  IMAGE,
  chat,
  clampCode,
  clampPrompt,
  detectBugs,
  generateImage,
  promptToCode,
  taskPrompt,
} from '../services/ai.js';
import { checkAi, markAi } from '../services/progression.js';
import { errorEmbed, webEmbed } from '../utils/embeds.js';
import { explainError } from '../utils/errors.js';
import { truncate } from '../utils/format.js';

const MODELS = [
  { name: 'Web', value: 'web' },
  { name: 'Fast', value: 'fast' },
];

const LANGUAGES = [
  'javascript', 'typescript', 'python', 'java', 'csharp',
  'cpp', 'php', 'go', 'rust', 'sql', 'html', 'bash',
].map((value) => ({
  name: value.charAt(0).toUpperCase() + value.slice(1),
  value,
}));

const rewriteStyles = [
  { name: 'Clear & confident', value: 'clear' },
  { name: 'Short & punchy', value: 'short' },
  { name: 'Friendly & warm', value: 'friendly' },
  { name: 'Formal & professional', value: 'formal' },
  { name: 'Dark / Spider Web', value: 'dark' },
];

async function guarded(interaction, ephemeral = true) {
  const check = checkAi(interaction.user.id);

  if (!check.ok) {
    return interaction.reply({
      embeds: [errorEmbed('Cooldown', check.message)],
      flags: MessageFlags.Ephemeral,
    }).then(() => false);
  }

  await interaction.deferReply(ephemeral ? { flags: MessageFlags.Ephemeral } : {});
  return true;
}

async function textAI(interaction, prompt, title = 'AI') {
  if (!(await guarded(interaction))) return;

  try {
    const result = await chat(clampPrompt(prompt), {
      model: interaction.options.getString('model') ?? 'web',
    });

    markAi(interaction.user.id);

    return interaction.editReply({
      embeds: [
        webEmbed({
          title: `${brand.emoji.spider} ${result.title ?? title}`,
          description: truncate(result.answer ?? result.text ?? result.content ?? 'The service returned no text.', 3900),
          color: brand.colors.primary,
        }),
      ],
    });
  } catch (error) {
    return interaction.editReply({
      embeds: [errorEmbed('The AI service did not answer', explainError(error))],
    });
  }
}

const ai = {
  data: new SlashCommandBuilder()
    .setName('ai')
    .setDescription('🕸️ SPIDER WEB AI')
    .addSubcommand((sub) =>
      sub
        .setName('ask')
        .setDescription('Ask the AI a question')
        .addStringOption((o) => o.setName('question').setDescription('Your question').setRequired(true).setMaxLength(2000))
        .addStringOption((o) => o.setName('model').setDescription('AI model').addChoices(...MODELS)),
    )
    .addSubcommand((sub) =>
      sub
        .setName('chat')
        .setDescription('Chat with the AI')
        .addStringOption((o) => o.setName('message').setDescription('Your message').setRequired(true).setMaxLength(2000))
        .addStringOption((o) => o.setName('model').setDescription('AI model').addChoices(...MODELS)),
    )
    .addSubcommand((sub) =>
      sub
        .setName('explain')
        .setDescription('Explain a topic simply')
        .addStringOption((o) => o.setName('topic').setDescription('Topic to explain').setRequired(true).setMaxLength(1500)),
    )
    .addSubcommand((sub) =>
      sub
        .setName('translate')
        .setDescription('Translate text')
        .addStringOption((o) => o.setName('text').setDescription('Text to translate').setRequired(true).setMaxLength(2000))
        .addStringOption((o) => o.setName('language').setDescription('Target language').setRequired(true).setMaxLength(50)),
    )
    .addSubcommand((sub) =>
      sub
        .setName('summarize')
        .setDescription('Summarize text')
        .addStringOption((o) => o.setName('text').setDescription('Text to summarize').setRequired(true).setMaxLength(3000))
        .addIntegerOption((o) => o.setName('sentences').setDescription('Number of sentences').setMinValue(1).setMaxValue(10)),
    )
    .addSubcommand((sub) =>
      sub
        .setName('rewrite')
        .setDescription('Rewrite text in a chosen style')
        .addStringOption((o) => o.setName('text').setDescription('Text to rewrite').setRequired(true).setMaxLength(2500))
        .addStringOption((o) => o.setName('style').setDescription('Writing style').setRequired(true).addChoices(...rewriteStyles)),
    )
    .addSubcommand((sub) =>
      sub
        .setName('code')
        .setDescription('Generate code and explain it')
        .addStringOption((o) => o.setName('description').setDescription('What should the code do?').setRequired(true).setMaxLength(1000))
        .addStringOption((o) => o.setName('language').setDescription('Programming language').addChoices(...LANGUAGES)),
    )
    .addSubcommand((sub) =>
      sub
        .setName('debug')
        .setDescription('Analyse code or an error')
        .addStringOption((o) => o.setName('code').setDescription('Code or error').setRequired(true).setMaxLength(3500)),
    )
    .addSubcommand((sub) =>
      sub
        .setName('describe')
        .setDescription('Describe a subject, concept or link')
        .addStringOption((o) => o.setName('subject').setDescription('What should I describe?').setRequired(true).setMaxLength(600)),
    )
    .addSubcommand((sub) =>
      sub
        .setName('imagine')
        .setDescription('Generate an image')
        .addStringOption((o) => o.setName('prompt').setDescription('Describe the image').setRequired(true).setMaxLength(600))
        .addStringOption((o) =>
          o.setName('size')
            .setDescription('Image size')
            .addChoices(
              { name: '512 × 512 (fast)', value: '512' },
              { name: '1024 × 1024 (detailed)', value: '1024' },
            ),
        ),
    ),

  async run(interaction) {
    const sub = interaction.options.getSubcommand();

    if (sub === 'ask') {
      return textAI(
        interaction,
        taskPrompt('ask', interaction.options.getString('question')),
        'Answer',
      );
    }

    if (sub === 'chat') {
      return textAI(
        interaction,
        interaction.options.getString('message'),
        'Chat',
      );
    }

    if (sub === 'explain') {
      return textAI(
        interaction,
        taskPrompt('explain', interaction.options.getString('topic')),
        'Explanation',
      );
    }

    if (sub === 'translate') {
      return textAI(
        interaction,
        taskPrompt(
          'translate',
          interaction.options.getString('text'),
          interaction.options.getString('language'),
        ),
        'Translation',
      );
    }

    if (sub === 'summarize') {
      const sentences = interaction.options.getInteger('sentences') ?? 5;
      return textAI(
        interaction,
        taskPrompt(
          'summarize',
          interaction.options.getString('text'),
          sentences,
        ),
        'Summary',
      );
    }

    if (sub === 'rewrite') {
      return textAI(
        interaction,
        taskPrompt(
          'rewrite',
          interaction.options.getString('text'),
          interaction.options.getString('style'),
        ),
        'Rewrite',
      );
    }

    if (sub === 'code') {
      if (!(await guarded(interaction))) return;

      try {
        const result = await promptToCode(
          interaction.options.getString('description'),
          interaction.options.getString('language') ?? 'javascript',
        );

        markAi(interaction.user.id);

        const codeText = result.code
          ? `\`\`\`${(result.language ?? 'javascript').toLowerCase()}\n${truncate(result.code, 1500)}\n\`\`\``
          : null;

        return interaction.editReply({
          embeds: [
            webEmbed({
              title: `${brand.emoji.spider} ${result.title ?? 'Generated code'}`,
              description: truncate(
                [
                  codeText,
                  result.explanation
                    ? `**How it works**\n${truncate(result.explanation, 1200)}`
                    : null,
                ].filter(Boolean).join('\n\n') || 'The service answered without code.',
                3900,
              ),
              fields: [
                { name: 'Language', value: String(result.language ?? '—'), inline: true },
                { name: 'Safety', value: 'Generated only — never executed by the bot.', inline: true },
              ],
              color: brand.colors.primary,
            }),
          ],
        });
      } catch (error) {
        return interaction.editReply({
          embeds: [errorEmbed('The code service did not answer', explainError(error))],
        });
      }
    }

    if (sub === 'debug') {
      if (!(await guarded(interaction))) return;

      try {
        const result = await detectBugs(
          clampCode(interaction.options.getString('code')),
        );

        markAi(interaction.user.id);

        const fixed = result.code
          ? `\`\`\`${(result.language ?? 'javascript').toLowerCase()}\n${truncate(result.code, 1500)}\n\`\`\``
          : null;

        return interaction.editReply({
          embeds: [
            webEmbed({
              title: `${brand.emoji.shield} ${result.title ?? 'Analysis'}`,
              description: truncate(
                [
                  result.explanation
                    ? `**What is wrong**\n${truncate(result.explanation, 1500)}`
                    : null,
                  fixed ? `**Suggested fix**\n${fixed}` : null,
                ].filter(Boolean).join('\n\n') || 'The service answered without a diagnosis.',
                3900,
              ),
              fields: [
                {
                  name: 'Detected language',
                  value: String(result.language ?? '—'),
                  inline: true,
                },
              ],
              color: brand.colors.warning,
            }),
          ],
        });
      } catch (error) {
        return interaction.editReply({
          embeds: [errorEmbed('The debug service did not answer', explainError(error))],
        });
      }
    }

    if (sub === 'describe') {
      const subject = interaction.options.getString('subject');

      return textAI(
        interaction,
        taskPrompt('describe', subject),
        'Description',
      );
    }

    if (sub === 'imagine') {
      const check = checkAi(interaction.user.id);

      if (!check.ok) {
        return interaction.reply({
          embeds: [errorEmbed('Cooldown', check.message)],
          flags: MessageFlags.Ephemeral,
        });
      }

      await interaction.deferReply();

      const size = interaction.options.getString('size') === '512'
        ? 512
        : IMAGE.width;

      try {
        const result = await generateImage(
          interaction.options.getString('prompt'),
          {
            width: size,
            height: size,
            steps: size === 512 ? 4 : IMAGE.steps,
          },
        );

        markAi(interaction.user.id);

        return interaction.editReply({
          embeds: [
            webEmbed({
              title: '🕸️ Image woven',
              description: truncate(result.prompt, 900),
              image: result.url,
              color: brand.colors.primary,
              fields: [
                { name: 'Size', value: `${size} × ${size}`, inline: true },
                { name: 'Requested by', value: `<@${interaction.user.id}>`, inline: true },
              ],
            }),
          ],
          allowedMentions: { parse: [] },
        });
      } catch (error) {
        return interaction.editReply({
          embeds: [
            errorEmbed(
              'The image service did not answer',
              `${explainError(error)}\n\nNo placeholder image is posted.`,
            ),
          ],
        });
      }
    }

    return interaction.reply({
      embeds: [errorEmbed('Unknown AI command', 'Choose one of the available AI subcommands.')],
      flags: MessageFlags.Ephemeral,
    });
  },
};

export default ai;
