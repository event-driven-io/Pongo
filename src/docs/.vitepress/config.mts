import { defineConfig } from 'vitepress';

const description =
  'Pongo - like Mongo but on Postgres or SQLite, with strong consistency benefits';

// https://vitepress.dev/reference/site-config
export default defineConfig({
  base: './',
  lang: 'en-GB',
  title: 'Pongo',
  description,
  themeConfig: {
    logo: '/logo.png',
    // https://vitepress.dev/reference/default-theme-config
    nav: [
      { text: 'Getting Started', link: '/getting-started' },
      { text: '🧑‍💻 Join Discord Server', link: 'https://discord.gg/VzvxR5Rb38' },
      {
        text: 'Release Notes',
        link: 'https://github.com/event-driven-io/Pongo/releases',
      },
      {
        text: 'Support',
        link: 'https://github.com/sponsors/event-driven-io',
      },
    ],

    sidebar: [
      {
        text: 'Documentation',
        items: [
          { text: 'Getting Started', link: '/getting-started' },
          { text: 'Schema migrations', link: '/schema-migrations' },
        ],
      },
    ],

    search: {
      provider: 'local',
    },

    editLink: {
      pattern:
        'https://github.com/event-driven-io/Pongo/edit/main/src/docs/:path',
      text: 'Suggest changes to this page',
    },

    socialLinks: [
      { icon: 'github', link: 'https://github.com/event-driven-io/Pongo' },
      { icon: 'discord', link: 'https://discord.gg/VzvxR5Rb38' },
    ],
    footer: {
      copyright: 'Copyright © Oskar Dudycz and contributors.',
    },
  },
  head: [
    ['meta', { property: 'og:title', content: 'Pongo' }],
    ['meta', { property: 'og:type', content: 'website' }],
    [
      'meta',
      {
        property: 'og:description',
        content: description,
      },
    ],
    [
      'meta',
      {
        property: 'og:image',
        content: 'https://event-driven-io.github.io/Pongo/social.png',
      },
    ],
    [
      'meta',
      {
        property: 'og:url',
        content: 'https://event-driven-io.github.io/Pongo/',
      },
    ],
    ['meta', { name: 'twitter:card', content: 'summary_large_image' }],
    [
      'meta',
      {
        name: 'twitter:image',
        content: 'https://event-driven-io.github.io/Pongo/social.png',
      },
    ],
  ],
});
