import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: ['dumbo', 'pongo', 'pongo-shims'].map((name) => ({
      test: {
        name: `${name} (types)`,
        include: [],
        typecheck: {
          enabled: true,
          only: true,
          include: [`packages/${name}/**/*.type.spec.ts`],
          tsconfig: `packages/${name}/tsconfig.json`,
        },
      },
    })),
  },
});
