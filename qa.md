# Q&A — Simplifying schema component migration resolution

## Q1

> Is sharing a single component instance across two parents something you want to keep supporting — e.g. the same table component registered in two schemas, or a reusable column/index definition reused across tables — or is a component always owned by exactly one parent in practice?

**A1 (verbatim):**

> Yes, that's a fair question, but I think that this can be a decent tradeoff to assing it when we're adding the component to schema, the other possibility is to do clone of those components assigning parent through construction, thoughts?
>
> Table definition potentially could be reusable, but typically shouldn't be the case that's shared in the same database, but fair point, then maybe cloning is a better way? Also schema extensions can reference table in other component (e.g. event store set as schema extension could reference read model to build it from events).

## Q2

> How does an extension like the event store use the table it references — does it only need the table's *identifier* (schema + table name) to emit SQL like `INSERT INTO myschema.read_model ...`, or does it need the table's *structure* (columns, types, primary key) to generate the projection?

**A2 (verbatim):**

> Firstly, you should not precisely my answers. You can add summary if that's helpful, but you need to quote it 1:1.
>
> > That points to a rule: a component may hold a name-based reference to another component, never an object reference — the reference resolves against the root at migration time.
>
> That makes sense, as long as it's strongly typed (so something like we have for foreign keys, we specify the reference by string).
>
> Still, we could also make some tradeoff to just merge by the schema component key and the migration id, or just ignore component from extension if it's defined in the "main schema".
>
> See the Pongo projection in emmett here:
> - /home/oskar/Repos/emmett/src/packages/emmett-postgresql/src/eventStore/projections/pongo/pongoProjections.ts
> - /home/oskar/Repos/emmett/src/packages/emmett-sqlite/src/eventStore/projections/pongo/pongoProjections.ts

## Q3

> Do you want to drop `migrations` from the `SchemaComponent` type entirely — so migrations are only ever obtained by an explicit call that carries the dialect (e.g. `migrationsOf(component, builder)`), leaving the declared ones as an inert `declaredMigrations` field — or do you need `component.migrations` to keep working as a bare property for some consumer I should know about?

**A3 (verbatim):**

> >  First, they don't hold a component reference at all
>
> Yes, the trick is that's also why we're making this whole exercise to make this possible. I think that we should also early come up here in this repo how this extension could look like.
>
> Personally, I'd prefer not to do any fancy visiting or so, I'd prefer to just do "hey take my migrations and add migrations of my children" and children will have their and their children etc.
>
> Or as we have on main, children just add to the paren.
>
> And no, I would prefer not to have migrations taken out of component., the whole idea of schema component is to make it self-contained.

## Q4

> Is "the component emits dialect-agnostic SQL tokens and the dialect-aware formatter renders the DDL" the direction you want — i.e. `DatabaseMigrationBuilder` and `databaseMigrations` are deleted, and `postgreSQLTableSQL`/`postgreSQLIndexSQL` move behind the formatter — or do you want to keep a per-dialect builder and only fix the naming/traversal duplication?

**A4 (verbatim):**

> Yes, SQLDefaultSchemaNameToken that's why I added it, but the concern is that user still need to pass the schema. When we define table we don't know the schema, we only know it when we attach it to schema.
>
> I want to keep it as simple as possible, and reduce this high ceremony from this PR where possible.

## Q5

> Can we drop the `=== defaultSchemaName` comparison and say the migration name simply mirrors what was declared — no schema segment when none was given, schema segment whenever one was — accepting that explicitly writing the default schema name now produces a different migration name than on `main`? Or must names stay byte-identical to `main` for existing deployments?

**A5 (verbatim):**

> I mean, the default schema token can still be a get out of the jail card, but we still need to be able to attach parent.
>
> Yes, we can say that but we still don't agree on how to attach the parent.

## Q6

> Which of these do you want — A (mutate on attach), B (clone on attach), or C (attach at construction, table definition is a function the schema applies)?

**A6 (verbatim):**

> I don't understand what do you mean by terminal step. Expand.
>
> B would be safer, but only if we could have simple way to clone it, e.g. via spread operator instead of fancy tree traversal.
>
> If not, then A.

## Q7

> Given that a real clone must re-invoke the factory rather than spread — is that per-component `withDatabaseSchema` one-liner still "simple enough" for B, or does that tip you to A?

**A7 (verbatim):**

> So C is not acceptable imho as it's tedious and not accessible.
>
> Given that a real clone must re-invoke the factory rather than spread — is that per-component withDatabaseSchema one-liner still "simple enough" for B, or does that tip you to A?
>
> This is for table, for column, index it should be with table, etc. right?

## Q8

> Can we drop `databaseName` from the resolution chain entirely — keeping it on `databaseComponent` as metadata for connection/reporting, but removing it from schema components, from migration identifiers, and dropping the "database name is required" throw — so that the only qualifier ever propagated is the schema name?

**A8 (verbatim):**

> Yes, we can drop it per my current knowledge.
>
> Regarding the extension, we also need to remember that it can be either attached to schema (then operates only within it) or to database (as e.g. read models can be on different schema than messages table)

## Q9

> If a table declares `databaseSchemaName: 'readmodels'` but no `databaseSchemaComponent` for `readmodels` exists in the tree — which is the normal case for a database-level extension — should the `CREATE SCHEMA readmodels` migration be emitted implicitly from the table's own qualifier, or must the user explicitly declare that schema component (and get a clear error / silently no schema creation if they don't)?

**A9 (verbatim):**

> Hm, I think that it'd be nice if it created this schema, but unsure which is easier to implement, it'd be nice to also add the typefd schema component for such database setup. So we could access it as db.readmodels.users etc.

## Q10

> Do you want Y — extensions declare their schemas explicitly and the database merges them, giving `db.schemas.readmodels.tables.users` typed and `CREATE SCHEMA` for free — or do you specifically want X, where a bare schema-qualified table anywhere in the tree conjures its schema implicitly?

**A10 (verbatim):**

> I think that it'd be fine if database extension component had the same definition as the database, so as you showed, this would be imho reusable and allow to compose those definition.
>
> Still, eventStore need to be able to define later own their specific, like projections, and other components. Typically people think about projections (see how currently src/packages/emmett-postgresql/src/eventStore/postgreSQLEventStore.ts defines options and projections).
>
> Btw. also Pongo database and colelction should allow specify schema name without this schema dance we're discussing. This is recommended but shouldn't be enforced on users. They should still be able to just setup db and then when doing db.collection('users', {...}) specify database schrema name (ofc then trading off potentially the type safety and not attaching this schema to db).

## Q11

> Is that acceptable — a schema-qualified table carrying its own `CREATE SCHEMA IF NOT EXISTS` — or should the ad-hoc path instead assume the schema already exists and let the database error if it doesn't?

**A11 (verbatim):**

> In general all migrations should be written in the idempotent way. When adding collection, we're calling addcollection on the pongo db component, which can create schema component of the certain name and add collection to it, right?

## Q12

> If a collection is added *after* `db.schema.migrate()` has already run, should the new collection migrate itself on first use, or should adding a collection mark the database component dirty so the next operation re-runs the full migration set?

**A12 (verbatim):**

> Whatever is easier, in general migrations should be idempotent, and migrator should just run those that weren't run already, see it does it by checking ids and hashes

## Q13

> Can `defaultSchemaName` stop being resolved eagerly in `pongoDb` — with the no-schema-given path producing an unnamed schema component backed by `SQLDefaultSchemaNameToken` — or does something downstream need that string at construction time?

**A13 (verbatim):**

> Yes, defaultSchemaName should be optional, if someone want to tell "hey, for all collections, unless said explicitly, don't use the default schema but this one".

## Q14

> Is (i) DDL-as-tokens behind the formatter in scope for this PR, or do we ship the resolution/traversal simplification with (ii) dialect-at-construction now and move DDL behind the formatter as a follow-up?

**A14 (verbatim):**

> > One thing I should flag: SQLDefaultSchemaNameToken is currently declared but never consumed — the only references are its own definition in
>
> Yes, I added with the intention to use it, but never plugged. If it's useful, use it, if not we could drop it.
>
> > DatabaseMigrationBuilder, databaseMigrations and the per-storage pongoPostgreSQLMigrationBuilder / pongoSQLiteMigrationBuilder all get deleted.
>
> That'd be great to remove abstractions if not needed.
>
> Yes, Pongo should allow their own customisation, for specific driver (e.g. if we want to add pgvector support or postgis that sqlite doesn't have), so we should keep some code to enable different typing, but as for now, I think that it should just use what we have in Dumbo.
>
> > Is (i) in scope for this PR, or do we ship the resolution/traversal simplification with (ii) now and move DDL behind the formatter as a follow-up?
>
> We want to fix the whole code. No monkey patching, but refactor it properly. While doing that we definitely want to do it step by step, test-first and ensuring that we don't have code broken for too long (build, linter, etc.)

## Q15

> Should the PR include a concrete event-store-shaped extension here — a fixture with a `messages` table in its own schema plus projection-contributed read-model tables in another, composed into a `pongoDb` and exercised end-to-end — as the proof the extension-as-database reshape actually carries emmett's case? Or just the primitive with unit tests, leaving the real shape to be discovered when emmett adopts it?

**A15 (verbatim):**

> It should include the example, so we could later move it to emmett, and treat this example as also some verification of whether our concept actually works. But make it a last step.

## Q16

> Should hand-written migrations be expected to use the reference tokens (so schema resolution happens in the formatter and attach-time requalification never needs to touch them) — or do you want an escape hatch where someone writes a literal `CREATE TRIGGER reporting.foo ...` string and we accept that it's their job to get the schema right?

**A16 (verbatim):**

> The hand written migration should be possible to do the same and use references

## Q17

> A hand-written migration wants to reference its own table but doesn't know the schema at authoring time, and a generic component has no fields to regenerate from. Which of A (default token), B (author states the schema literally), or C (migrations as a function of the resolved qualifier, i.e. lazy) — or is referencing your own parent's schema out of scope?

**A17 (verbatim):**

> It's not an issue that migrations are lazy, the issue is that there's a lot of fancy tree-traversal and other bs that needs to be simplified

## Q18

> Is it acceptable that components stay context-free and only the root produces correct migrations (resolve-at-read), or do you need a plucked-out child to be self-describing, which is what forces cloning?

**A18 (verbatim):**

> I don't like any of that, it still brings massive complexity imho as you're now handwaving with "just migrationsIn(ctx). I don't think that this is so simple.
>
> he schema re-invokes each child's factory with its name. - I don't think that's simple, this would recreate this maze of traversal we have already

## Q19

> Is the shape you want: mutate the qualifier on attach, lazy `migrations` getter that concatenates own + children — and on a second attach, throw or keep the first?

**A19 (verbatim):**

> // databaseSchemaComponent — the whole attach step
> for (const table of Object.values(tables)) table.databaseSchemaName ??= schemaName;
>   this is also handwaving as table may have numerous children and we'll need to consider each type of them and loop.
>
> Can't we just:
> - copy objects on clone with parent,
> - have migrations in options being function,
> - have migrations on schema component be getter
>
> then when we call getter it'll call the function from options, and having that we cloned with parent assigned then all should be already available and when we rerun we will have a proper reference?

## Q20

> Reparent the children with a five-line generic recursive clone, or keep components parentless and pass the parent down through the getter?

**A20 (verbatim):**

> I mean, I'm fine having generic parent, but I'm also fine having explicit wrapper for them like table for index and schema for table.
>
> I still don't understand why would it need to be generic. When we're cloning then we're already assigning parent, and function from options will have then the proper one from this? Am I missing something?

## Q21

> Should the table own its indexes' DDL — so cloning is a one-level spread with no recursion at all — or do indexes stay independent components emitting their own migrations, accepting the recursive reparent?

**A21 (verbatim):**

> Man, they can emit their own DDL, they can be separate statements, right? And can be altered, aye?

## Q22

> Should `options.migrations` always be a function of the component, or should a plain array still be accepted as sugar?

**A22 (verbatim):**

> That's also why I initially suggested to make parent mutable and a reference. If it's always clone, then it's safe, or not?
>
> And no, we don't need to accept array for now, we can add it later.

## Q23

> A table's `declare` needs the schema name: direct hops (`this.parent?.parent?.schemaName`), or walk the parent chain until something has a `schemaName`?

**A23 (verbatim):**

> no, this.parent?.parent?.schemaName but this.table?.schema?.schemaName, right?

## Q24

> Named accessors over a generic `parent` — or the stored field itself named per kind, with the key passed into the clone?

**A24 (verbatim):**

> I think that I'm fine o fhaving getters as you showed/

## Q25

> `Object.getOwnPropertyDescriptors` is the one non-obvious line in the design — a reader has to know that spread invokes getters and descriptor-copy does not. Keep the getter and pay for it with the descriptor copy, or drop accessors entirely (`component.migrations()`, `schema`/`table` as plain fields) so `withParent` is an ordinary spread?

**A25 (verbatim):**

> Man, eventually yes, migration will be a function, but if it's getter then it's the same for now, right, if we make it consistently a getter, right?

## Q26

> Should attaching an already-attached component silently re-parent, or throw and force the unattached definition to be passed?

**A26 (verbatim):**

> I mean, if you can make this a function already, I'm fine.if that helps.
>
> Also reparenting, could you get back to my original question, maybe it's just easier to make parent mutable?

## Q27

> "No accessors" has to mean all of them — one surviving getter and the spread is silently wrong again. Do `schema` and `table` become functions too (`this.table().schema().schemaName`), or stay getters and put the descriptor copy back just for those two?

**A27 (verbatim):**

> I'm fine making them functions if that helps a lot

## Q28

> Two functions want the name `migrations`: the one passed in (own only, takes the component) and the one exposed (own plus descendants, takes nothing). Rename the options side, rename the component side, or keep both?

**A28 (verbatim):**

> Dude, I don't watn any additional property, that's the whole story of this refactoring!

## Q29

> Dry run of the agreed shape, before implementation.

**A29 (verbatim):**

> Could you do a dry run testing if what you think will work? I'm not sure if you're not making it up again

**Result:** first run failed — an unattached table's index rendered `<default>.undefined`, because attachment was modelled as something a schema does to its tables. Fixed by attaching children inside `createSchemaComponent` itself, which also removed the two-phase construction in the schema factory and the whole per-kind attach step. Nine assertions then passed, including the deliberately broken variant that closes over `component` instead of `this` and silently emits unqualified SQL.
