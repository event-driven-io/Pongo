# Q&A — Simplifying schema component migration resolution

## Q1

> Is sharing a single component instance across two parents something you want to keep supporting — e.g. the same table component registered in two schemas, or a reusable column/index definition reused across tables — or is a component always owned by exactly one parent in practice?

**A1 (verbatim):**

> Yes, that's a fair question, but I think that this can be a decent tradeoff to assing it when we're adding the component to schema, the other possibility is to do clone of those components assigning parent through construction, thoughts?
>
> Table definition potentially could be reusable, but typically shouldn't be the case that's shared in the same database, but fair point, then maybe cloning is a better way? Also schema extensions can reference table in other component (e.g. event store set as schema extension could reference read model to build it from events).

## Q2

> How does an extension like the event store use the table it references — does it only need the table's _identifier_ (schema + table name) to emit SQL like `INSERT INTO myschema.read_model ...`, or does it need the table's _structure_ (columns, types, primary key) to generate the projection?

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
>
> - /home/oskar/Repos/emmett/src/packages/emmett-postgresql/src/eventStore/projections/pongo/pongoProjections.ts
> - /home/oskar/Repos/emmett/src/packages/emmett-sqlite/src/eventStore/projections/pongo/pongoProjections.ts

## Q3

> Do you want to drop `migrations` from the `SchemaComponent` type entirely — so migrations are only ever obtained by an explicit call that carries the dialect (e.g. `migrationsOf(component, builder)`), leaving the declared ones as an inert `declaredMigrations` field — or do you need `component.migrations` to keep working as a bare property for some consumer I should know about?

**A3 (verbatim):**

> > First, they don't hold a component reference at all
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

> If a collection is added _after_ `db.schema.migrate()` has already run, should the new collection migrate itself on first use, or should adding a collection mark the database component dirty so the next operation re-runs the full migration set?

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
> this is also handwaving as table may have numerous children and we'll need to consider each type of them and loop.
>
> Can't we just:
>
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

## Q30

> Why `this: AnySchemaComponent` on `indexComponent`'s `table()` instead of `AnyIndexComponent`?

**A30 (verbatim):**

> table(this: AnySchemaComponent): AnyTableComponent | undefined {
> return this.parent as AnyTableComponent | undefined;
> }, - why AnySchemaComponent instead of AnyIndexComponent?

**Finding:** no technical reason. `AnySchemaComponent` was simply the weakest type carrying `parent`. Because a `this` parameter is contravariant, the wide type let anything with a `parent` call `.table()` — exactly the misuse worth rejecting. Narrowed in both places (`AnyIndexComponent` on `table()`, `AnyTableComponent` on `schema()`); `tsc -b --force` clean, 1028 unit tests pass, lint clean.

## Q31

> Should the narrowing apply to `tableComponent.schema()` as well, and does the review gate's `attachChildren` finding stand?

**A31 (verbatim):**

> Plus same for review, agreed that attachChildren this looks phishy

**Review gate R verdict on S4: STOP.** Non-test source 22,770 → 22,810 (+40). New purely-additive exported symbol `resolveDatabaseSchemaName` with zero production callers, replacing one inline loop rather than two or more, and not replacing even that one everywhere — `pongoDatabaseSchemaComponent.ts:63` still carries a copy. `attachChildren` faulted on three counts: `attached[alias]!` silently yields a map of `undefined` if a named alias is absent from `components`; the `length > 0` guard makes empty named maps behave differently from non-empty ones; and it scans every own property, with `parent` escaping only by accident. The S1 accessor assertion walks only a generic `schemaComponent`, never a table or index — the two that just gained methods. Four tests went soft, comparing a string to itself.

## Q32

> Why is `.table()` not used in production?

**A32 (verbatim):**

> Also, it's not acceptable that stuff is neither tested nor used in production like index .table(), why isn't it used in migrations?

**Finding:** confirmed by grep — `.table()`, `.schema()` and `resolveDatabaseSchemaName` have zero references outside spec files. `databaseMigrations.ts` answers the same question with its own mechanism: it pushes an `Identifier` down the tree through `visit`. Worse, the two disagree. `databaseMigrations.ts:86-89` resolves a table's schema as parent-wins, declared-as-fallback; the new resolver implements declared-wins, throw-on-conflict. Both rules ship; the one that runs is the wrong one.

## Q33

> Pull S9's rewiring forward so the accessors get production callers?

**A33 (verbatim):**

> I could be fine doing those s9 parts now, but first I'd like you to review other points you raised, asnd redundant stuff, plus I personally don't like methods that start with "resolve", "provide", they're usually smelly and those vague prefixes usually suggest some missing bit. So yes, note down what we potentially like to plug now, but consider other review feedback, redundant abstractions etc.
>
> I still don't understand why do we need attachChildren, and other stuff you highlighted

**On the naming:** the `resolve` prefix was hiding a missing bit. The function answers a question a component has about itself — "what schema am I in?" — so it belongs inside that component's own `migrations()`, not in a free helper.

## Q34

> A component's position in the tree is answered three ways: declared fields on the component, `identify` in `databaseMigrations.ts` which pushes position down through the walk and lets the parent win, and the S4 parent chain which pulls position up and lets the declaration win. Only `identify` runs in production. Which is the single answer?

**A34 (verbatim):**

> Dude, the whole reason why we added migrations as a function in options and made migrations a function in schema component is to be able to resolve it on call, and that's why we plugged the parent, to have it at the time when it's run, and put it into migration. Literaliilly wtf

**Also asked (verbatim):**

> I also don't get what's event databaSeMigrations.identify. And why is it computed, I don't think that's what we agreed

**Finding:** the question was already settled and should not have been asked. `databaseMigrations.ts` does not exist on `main`. All 199 lines — `DatabaseMigrationBuilder`, the `Identifier` union, `identify`, and the downward `parentIdentifier` threading — were introduced on this branch by commit `b6f27ec5` "Refactoring step 1". It is the machinery `migrations()` as a method was meant to replace, not something that predates it.

## Q35

> Collapse S4 and S9 into one piece, or do the smaller version now and leave `DatabaseMigrationBuilder` for S9?

**A35 (verbatim):**

> No, I want to to do it step by step but endure that you're not creating useless abstractions that will then to be a substance of big refactoring ontheir own

**Rule adopted:** every symbol added from here must have a production caller the moment it lands, and must already be in its final shape. Nothing is added now that a later step would tear out.

## Q36

> Should the alias under which a schema is stored keep naming an unnamed schema — which needs a component to know its own alias — or should an unnamed schema resolve to the default token, making the alias purely a lookup key?

**A36 (verbatim):**

> If it's not a big burden or refactoring, then yes, it can be one of the pieces in the chaing to detect the schema name, but could you expand why is it a blocker?

**Correction:** it was not a blocker, and calling it one was an overstatement. The parent chain carries `parent` but not the alias, and the alias lives in the map rather than on the child — but `componentsWithParent` already holds `[alias, child]` at the exact moment it sets `parent`, so setting `alias` there is the same line.

## Q37

> Confirming the shape before implementation.

**A37 (verbatim):**

> Dude, I thought that we agreed that attachChildren needs to go. Also why do you need reverse lookup by identity?!

**Agreed shape.** `attachChildren` and `isAliasedComponents` are deleted outright. `componentsWithParent` clones each child setting `parent` and `alias` — no own-property scanning, no duck-typing, no non-null assertion, and no reverse lookup, which was an option the design makes pointless.

`resolveDatabaseSchemaName` is deleted. `identify`, the `Identifier` union and the `parentIdentifier` threading are deleted. The walker iterates `components` rather than the named maps, which is what made the repoint load-bearing. `DatabaseMigrationBuilder` survives untouched for S9 to remove properly.

Resolution chain, evaluated at `migrations()` call time by the component itself:

- schema: `schemaName` → its alias under the database → default schema token
- table: `databaseSchemaName` → its schema's resolved name → default schema token
- index: `databaseSchemaName` → its table's resolved name → default schema token

`databaseComponent.ts:69-73` already throws when a declared `schemaName` disagrees with its alias, so the two can never conflict; the alias only fills in where nothing was declared.

## Q38

> "the walker's rule today is parent-wins, and we're switching it to declared-wins with a throw on conflict — the integration suite is what tells us whether any emitted SQL moves."
>
> Expand on what you said here. I never seen such discussion

**Correction — the claim was overstated, and Oskar is right that no such discussion happened.**

What is actually in the code:

- `databaseMigrations.ts:86-89` picks a table's schema as `'databaseSchemaName' in parent ? parent.databaseSchemaName : component.databaseSchemaName`. Read alone, that is parent-wins.
- `databaseMigrations.ts:76-83` returns the parent identifier for a schema whenever the parent already carries `databaseSchemaName`, and the database branch at `:157-165` always supplies it from the `database.schemas` alias — so `component.schemaName` at `:78` is unreachable for any schema entered through the database.

What "declared-wins with a throw" referred to: the construction-time loop S4 deleted from `databaseSchemaComponent.ts` (old lines 58-69), which threw when a table's declared `databaseSchemaName` disagreed with the schema holding it, plus `resolveDatabaseSchemaName`, which reimplements that rule and which nothing calls.

**Why the precedence question is not observable.** A disagreement cannot reach the walker:

- `composePongoDatabase` groups collections _by_ `collection.databaseSchemaName ?? defaultSchemaName`, so a table lands in the schema it declares; the explicit-schemas branch throws on mismatch (`pongoDatabaseSchemaComponent.ts:58-65`).
- `pongoDb.ts:184-188` throws when a schema scope is asked for a collection in another database schema.
- `databaseComponent.ts:69-73` throws when a schema's declared `schemaName` disagrees with its alias.
- `tableComponent.ts:88-106` throws when an index's declared names disagree with its table.

So line `:86-89` only ever chooses between a parent value and `undefined`, where parent is the only answer. Emitted SQL cannot move, and the integration suite cannot tell us anything about it — saying it would was wrong.

**The finding that survives.** S4 deleted the only code that threw for a table constructed directly against dumbo's `databaseSchemaComponent`, below every pongo guard, and no test failed. That gap is untested, not merely unenforced.

## Q39

> should dumbo's databaseSchemaComponent throw on a table whose declared databaseSchemaName disagrees with its schema at all - dude, what do you mean, how would that be even possible?

**How it is possible.** Only by calling dumbo's own component API, below every pongo guard:

```ts
databaseSchemaComponent({
  schemaName: "crm",
  tables: {
    users: tableComponent({ tableName: "users", databaseSchemaName: "audit" }),
  },
});
```

`schemaName` (`databaseSchemaComponent.ts:44`) and `databaseSchemaName` (`tableComponent.ts:118`) are independent free-form options, and after S4 deleted the loop nothing compares them. Both constructors are re-exported through `components/index.ts`, so this is `@event-driven-io/dumbo`'s public surface, not an internal back door. Every pongo path is safe because pongo groups by the declared name and throws first.

Today the call above builds without complaint and the walker emits `crm.users`, silently discarding `audit`. On `main` it threw.

## Q40

> I mean why would table have schemaname as options param

**Where it comes from.** It is a _declaration-time placement hint_ for the flat definition form. `pongoSchema.db({ collections: { users, orders } })` has no schemas block, so the collection itself is the only place to say where it lives:

```
pongoSchema.collection('users', { databaseSchemaName: 'crm' })
  → pongoCollectionTable (pongo/core/schema/index.ts:104)
  → dumboSchema.table (dumboSchema.ts:81)
  → tableComponent({ tableName, databaseSchemaName })
```

`composePongoDatabase` then _groups by it_ — `collection.databaseSchemaName ?? defaultSchemaName` (`pongoDatabaseSchemaComponent.ts:46`) — to synthesise the schema components. So the field's whole job is to decide which schema a table gets filed under, and it is consumed **before the tree exists**.

**What reads it afterwards.** Nothing in production. The only post-composition reads are:

- `databaseMigrations.ts:89` — the parent-vs-declared fallback, unreachable once the composer has grouped
- `databaseSchemaComponent.ts:86` — `resolveDatabaseSchemaName`, which nothing calls
- `tableComponent.ts:92` — reads an _index's_ field, not a table's, at construction time

The `identifier.databaseSchemaName` reads in `databaseObjectSQL.ts` and `migrationNames.ts` are the walker's identifier, not the component field.

**So the field is vestigial on the built component.** Once the table sits under a schema, its position already carries the answer; the copy on the component is leftover input, and that leftover is the only reason a conflict can be expressed at all.

## Q41

> That's also why we have dumboSchema.database, dumboSchema.table etc. to make it smoother keeping the component intenral, don't we? THen we could have this schemaname, and potentially throw on assignment if it's different or just override it on the assignment. But dumboSchema helpers shouldn't allow that (same pongoSchema). Thoughts?

**Agreed on the layering, but the check cannot live in the builders.** `pongoSchema.schema` does not route through `dumboSchema.schema` — `pongo/core/schema/index.ts:372-385` calls `databaseSchemaComponent` directly, and `dumboSchema.schema` calls it directly too. A guard in the builders is therefore two copies that must agree, and a third front door (the component) still open.

The component is where both builders meet, and it is where the check already lived before S4 deleted it. `tableComponent.ts:88-106` puts the equivalent index guard in exactly that place, so restoring it is consistency rather than a new rule.

**Throw, not override.** Overriding turns `databaseSchemaName: 'crm'` into `audit` with no signal, and every other placement conflict in the codebase throws — `databaseComponent.ts:69-73`, `tableComponent.ts:88-106`, `pongoDb.ts:184-188`, `pongoDatabaseSchemaComponent.ts:58-65`.

**Net effect is deletion.** One restored loop in `databaseSchemaComponent` makes `pongoDatabaseSchemaComponent.ts:58-65` redundant, and removes the need for `resolveDatabaseSchemaName`, `identify` and the `Identifier` threading. A table's `migrations()` then reads its schema from its parent with no fallback, because construction has already guaranteed they agree.

## Q42

> I don't think that we should be pushing checks to Pongo, instead of having them in Dumbo, what's the use of that?

**Agreed — `pongoDatabaseSchemaComponent.ts:58-65` goes.** The conflict still surfaces: `composePongoDatabase` builds each schema through `pongoSchema.schema(databaseSchemaName, collections, ...)`, which calls `databaseSchemaComponent` directly, so the restored dumbo loop throws inside the same call. The message text at `pongoDatabaseSchemaComponent.ts:63` is already a copy of dumbo's wording, so the only observable change is where the throw originates.

`collection.databaseSchemaName` at `pongoDatabaseSchemaComponent.ts:46` stays — that is the grouping read, not a check, and it is the reason the field must remain on the built component rather than being options-only.

## Q43

> Tbt, I'm also not a huge fan of composePongoDatabase
>
> About databaseMigrations.ts:102-112 - didn't we agree to drop int entirely?
>
> I think that for now we should support just on tables and don't go crazy

**Yes — Q37 already agreed `identify` and the `Identifier` union go entirely; the branch should not have been raised again.**

**Indexes are supported only on tables.** No free-floating index, no fallback in an index's `migrations()`: it reads its parent table, which reads its parent schema, which resolves `schemaName` → alias → default. `tableComponent.ts:88-106` already forces a nested index to agree with its table, so nothing else is needed.

## Q44

> Yes, I don't see a reason why should it exist, especially with this weird throwing etc.

**`composePongoDatabase` dissolves.** `pongoSchema.db` already builds a real `databaseComponent` in both branches (`pongo/core/schema/index.ts:441-460`). In the schemas form the composer tears that component apart and rebuilds identical copies — pure waste. In the collections form `pongoSchema.db` builds `schemas: {}` and stashes the raw collections under a `collections` property via `withValue`; that stash exists _only_ so the composer can group them later.

Two runtime values are the composer's stated reason to be deferred:

- `defaultSchemaName` — dissolved by Q37. An unnamed schema resolves to `SQLDefaultSchemaNameToken` at `migrations()` time, so the flat form can group at declaration time without knowing whether the driver says `public` or `main`.
- `databaseName` — still only known at connection time. It reaches no emitted SQL: `migrationNames.ts` and `databaseObjectSQL.ts` read `databaseSchemaName`, `tableName` and `indexName` only. Its live uses are the guard at `databaseComponent.ts:58-66`, the throw at `databaseMigrations.ts:58-60`, and `IndexSQLContext.databaseName` exposed to custom index SQL callbacks.

## Q45

> Dude, didn't we already agree that we don't need database name in the migrations (besides creating database potentially_ and the whole databaseMigration should be removed eventually? DId you even read the fng spec?

**Yes — D7 removes `databaseName` from the resolution chain and Phase 4 deletes `databaseMigrations` entirely. The question should not have been asked.**

With `defaultSchemaName` dissolved by D5 and `databaseName` reduced to connection metadata by D7, `composePongoDatabase` has no runtime input left, so it collapses into `pongoSchema.db` along with the `withValue(database, 'collections', ...)` stash and the duplicate throw at `pongoDatabaseSchemaComponent.ts:58-65`.

## Q46

> If that makes sense, yes

**Recorded as a new spec item.** One wrinkle found while placing it: the flat form groups collections that declare no `databaseSchemaName` into a schema that has no name. Under the Q37 chain (`schemaName` → alias → default) that group's map key would be read as its schema name, so the alias link must not fill in for it.

## Q47

> Dude, we were already discussing it, read the spec.md

**D9 already answers it:** with no `defaultSchemaName`, collections go into an _unnamed_ default schema component whose qualifier is `SQLDefaultSchemaNameToken`. A schema created without a name carries the token; its map key is never read as a name. The alias fills in only for schemas the user keyed in a `schemas` block.

**Correction to Q44/Q46:** `defaultSchemaName` does not dissolve — D9 keeps it as an optional explicit override, so it remains a runtime input. `composePongoDatabase` therefore is not replaced by declaration-time grouping; it is replaced by D10, where `pongoDb` get-or-creates schema components through `withTable` and holds the database component as an immutable value behind a mutable holder. Its removal belongs with D9/D10 in **Phase 5**, not Phase 3.

## Q48

> dude, stop, we're circlicng back and forth. Let's again discuss the real issue. Do we really need to clone it, can't we just assign parent?

**No, and cloning is what created every problem in this thread.** Assigning `parent` on the child itself means the parent's `components` and its named maps (`tables`, `indexes`, `columns`, `schemas`) hold the *same objects*, so there is nothing to keep in sync. That deletes, in one move: `attachChildren`, `isAliasedComponents`, the repoint step, the recursive `withParent`, the grandchild-staleness problem that forced the recursion, and the `alias`/`componentGroups` inventions that were only ever attempts to survive cloning.

`withParent` itself disappears — the attach loop becomes `child.parent = component`.

Two consequences to settle:

- A child cannot be frozen at its own construction, since `parent` is assigned when it is put into a parent. Freezing moves to attach time.
- The same component instance put into two parents would have its `parent` rewritten by the second — the reuse hazard spec D1 cited when it rejected mutation.

## Q49

> Do we really need `parent` at all, or should the walk pass the context down? (Options A — child reads up via `this.parent`; B — context threaded down, no back-pointer.)

**B, chosen and confirmed: "The whole idea of threading context was to keep the component immutable, no clone, no whatsoever, just pass parent context."**

This overturns spec D1 (attach by cloning with a parent pointer) and everything built on it. `parent`, `withParent`, `attachChildren`, `isAliasedComponents` and the component-level `Object.freeze` all go. A component is an immutable value that is never rewritten when placed, so the parent's `components` map and its typed maps (`tables`, `indexes`, `columns`, `schemas`, `extensions`) hold the same objects and there is nothing to keep in sync.

Measured from the PoC on real code: production breakage was confined to `databaseMigrations.ts`; production delta 58 insertions / 185 deletions.

**Capability lost, and confirmed not needed by production:** a component pulled out of the tree can no longer say where it lives (`table.schema()`, `index.table()`). Checked every consumer — pongo's DML path does not ask: `pongoDb.ts:248-249` already knows `databaseSchemaName` locally and builds the identifier at `pongoDb.ts:281-285` before calling `sqlBuilderFor`. The pg and SQLite SQL builders take a `TableIdentifier` argument and never read placement off the component. The only readers were tests written against D6.

**Spec items overturned:** D1 in full; D6's step 1 (`this.schema()` through the parent pointer); §2's "no identifier threading" — threading is now the mechanism, not the thing being removed. What survives from D6 is the conflict rule (a table declaring one schema and placed in another throws) and the default-schema fallback.

## Q50

> `databaseMigrations` has to be dropped, and no tree-traversal attach-children.

**Both hold under B, and B is what makes them possible.** `databaseMigrations` existed to reconstruct identifiers top-down on a second walk; with `migrations(context)` recursing through each component and each component extending the context with what it knows, there is one walk and it is the components' own. No visitor, no `DatabaseMigrationBuilder`, no `visit(component, databaseSchemaName, tableName)`.

The PoC's interim `databaseMigrations.ts` still threads two identifiers by hand — that is scaffolding, not the target; it dies with the file.

## Q51

> Where can it happen that we have undefined schema name?

Three places in the code as it stands:

1. **A schema built without a name** — `dumboSchema.schema({ users })` hits the overload at `dumboSchema.ts:122-126`, which passes `schemaName: undefined` explicitly. Spec D9's unnamed default schema is this case.
2. **A nameless schema under a record key** — `dumboSchema.database('app', { crm: dumboSchema.schema({ users }) })` yields `schemas.crm.schemaName === undefined`, because option 2 makes a key a lookup handle and never a name. `databaseComponent.ts:69-73` only validates key-against-name when a name exists.
3. **A component migrated on its own** — `dumboSchema.table('users').migrations()`, or `schema.migrations()` called directly. No parent ran, so the context is `{}`.

(2) is the only one where a user supplied a name and it was silently discarded.

## Q52

> What if we require schema name in `dumboSchema.schema`?

**Adopted.** It removes (1) and (2) at once — (2) cannot arise because a keyed schema always has a name and the existing key-against-name check covers it. Only (3) survives, and it now has a single unambiguous meaning.

## Q53

> No schema means default schema.

**Settled, and it answers the open default-schema question.** Absence of a schema component *is* the default schema. Therefore:

- `databaseSchemaName: undefined` in the context means the default schema. `SQLDefaultSchemaNameToken` is never a value in `SchemaComponentContext`; it appears only in emitted SQL, for the formatter to resolve. `SchemaComponentContext.databaseSchemaName` stays `string | undefined`.
- "Unnamed schema" and "no schema" stop being two encodings of one state — there is no unnamed schema.
- Spec D9's *unnamed default schema component* is withdrawn. Pongo with no `defaultSchemaName` puts collections directly under the database, so no name has to be invented and D8's migration names stay byte-identical to `main` (no schema segment).
- The guard at `databaseMigrations.ts:94-97` (`isTableComponent(component) && databaseSchemaName !== undefined`) goes. It exists only because unqualified DDL was unrepresentable, and it is the cause of spec §1's silently-dropped table in a database-level extension.

## Q54

> Requiring a name makes the keyed form write the name twice (`{ crm: schema('crm', {...}) }`). Keep the keyed record, or take named schemas positionally and derive each key from its name?

**Keep the keyed record and throw when the key and the name disagree.** The check already exists at `databaseComponent.ts:69-73`; it stops being a partial validation (it only fired when a name happened to be present) and becomes total, since a name is now always present.

## Q55

> Should `databaseComponent` gain a `tables` map for schema-less tables?

**No — dumbo stays schema-aware.** A database holds schemas and extensions; nothing else. Pongo does the collection-to-schema mapping and is syntactic sugar over dumbo, exposing `collections` flat plus `schemas` when schemas are declared. Pongo creates a default schema when none is given, and adds a schema alongside it when a collection declares its own `databaseSchemaName`.

## Q56

> Then where do schema-less tables live? (a) `databaseComponent.tables`, (b) pongo always names a schema, (c) a database-level extension, (d) something else.

**None as stated — the flawed premise was Q52's wording.** "Requires a name" was read as "the name is a string", which is what forced schema-less tables into existence. There are no schema-less tables.

## Q57

> Is the default schema a real schema component named by `SQLDefaultSchemaNameToken`, and how is it spelled?

**Yes, and it is spelled `dumboSchema.defaultSchema({ users })`.**

```ts
schemaName: string | SQLDefaultSchemaNameToken   // always present, never undefined
```

- `dumboSchema.schema('crm', { users })` — a named schema. A name is mandatory on this form.
- `dumboSchema.defaultSchema({ users })` — the default schema, carrying the token.
- `SchemaComponentContext.databaseSchemaName` becomes `string | SQLDefaultSchemaNameToken`. There is no "unknown qualifier" state, so the skip-if-undefined guard at `databaseMigrations.ts:94-97` disappears and with it spec §1's silently-dropped table.
- The formatter resolves the token: no prefix on SQLite, no prefix on Postgres (resolved through `search_path`). Migration names get no schema segment for it, so D8's back-compat holds without the `=== defaultSchemaName` comparison.

**Corrects Q53**, which claimed the token was redundant with `undefined` and could be deleted. The reverse: the token is what stops `undefined` from existing.

## Q58

> Would per-kind recursion get rid of the weird `this`, the traversal and the maze? Typed context is nice to have, but only if it's a line or two per component and not plumbing that's easily forgotten. Maybe we could also get rid of `findComponents`, `logicalSchemaMapping`.

**Flat context, one erased child list, factory owns its literal.**

- `this` dies the moment the factory owns its own object literal — independent of the recursion question.
- The maze is `databaseMigrations.ts`, 128 lines of second walk; it dies either way.
- Per-kind recursion buys typed context and costs one child-map line per factory. If a kind later gains a child map and someone forgets the line, **those children silently never migrate**. One merged child list built at construction cannot be forgotten. Correctness beats field-level typing.

## Q59

> Why do we need `mergeSchemaComponentMaps`?

**We don't, once nothing reads the erased child list by key.** It existed to build that list and to throw when the same key appeared in two typed maps — a throw only needed because the list was a keyed record. After `findComponents` goes, the recursion only ever does `Object.values(...)`, so the list becomes a plain array:

```ts
components: [...Object.values(tables), ...Object.values(extensions)]
```

A key reused for both a column and an index stops being a collision — both children are present and both migrate. `mergeSchemaComponentMaps`, its duplicate-key throw and that test all go. The typed maps keep their keys and `schemaComponentMap` stays for them.

## Q60

> Due diligence — what else can be dropped or simplified?

Newly found beyond the already-agreed deletions:

1. **`supportsSchemas` / `supportsFunctions`** — declared in `DatabaseCapabilities`, set in both metadata objects, read nowhere. (`supportsMultipleDatabases` is read at `pongoDatabaseCache.ts:89` and stays.)
2. **`schemaComponent()` / `genericComponentType`** have one production caller: `migrationTableComponentFor`, which hand-writes `CREATE TABLE IF NOT EXISTS` with column tokens — exactly what `createTableSQL` generates from `table.columns`. Making the migration table a real `tableComponent` deletes the last untyped component kind.
3. **`isPongoSchemaComponent` / `isPongoDatabaseComponent`** have zero production readers; `pongoCollectionComponentType`'s three readers reduce to one (`pongoDb.ts:255`) once pongo's migration builders go.
4. **Five zero-consumer public types** in `tableTypesInference.ts` (`InferColumnType`, `TableColumnType`, `InferTableRow`, `InferSchemaTables`, `InferDatabaseSchemas`). Public API — left alone deliberately.
5. `createTableSQL` is already the shared table-DDL builder; S9 changes what it emits, not that it exists.

**Out of scope:** `components/relationships/` — 971 lines of type-level validation, orthogonal to migration resolution.

## Q61

> Fold both judgement calls into the spec: migration table becomes a real `tableComponent`, and drop `supportsSchemas`/`supportsFunctions`.

**Adopted.** Both are in the spec as D19 and D20.
