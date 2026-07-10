type History = { street: string; note: string };

type Address = {
  city: string;
  street: string;
  history: History[];
};

export type InsertOneSpecialCharacterDocument = {
  _id?: string;
  name: string;
  age: number;
  address: Address;
  tags: string[];
  profile: {
    title: string;
    quote: string;
    sqlLike: string;
    jsonLike: string;
    dateLike: string;
    bigintLike: string;
    negativeBigintLike: string;
    pathLike: string;
    whitespace: string;
  };
  extra: Record<string, string>;
};

export const insertOneSpecialCharacterCases = [
  {
    name: 'apostrophes and nested apostrophes',
    document: {
      name: "director's cut",
      age: 25,
      address: {
        city: "St. John's",
        street: "Queen's Lane",
        history: [
          { street: "King's Road", note: "owner's copy" },
          { street: "Baker's Street", note: "collector's edition" },
        ],
      },
      tags: ["can't", "won't", "it's"],
      profile: {
        title: "director's cut",
        quote: "here's looking at you",
        sqlLike: "value's still bound",
        jsonLike: `{"title":"director's cut"}`,
        dateLike: '2024-07-15T16:30:00.000Z',
        bigintLike: '9007199254740993',
        negativeBigintLike: '-9007199254740993',
        pathLike: '$.profile.title',
        whitespace: "first line\nsecond line\twith tab and owner's mark",
      },
      extra: {
        "apostrophe'key": "apostrophe'value",
        'curly-apostrophe': 'director’s cut',
      },
    },
  },
  {
    name: 'quotes slashes and json escapes',
    document: {
      name: `"quoted" \\ slash / solidus`,
      age: 26,
      address: {
        city: 'Escape "City"',
        street: String.raw`C:\Program Files\Pongo`,
        history: [
          {
            street: String.raw`\\server\share`,
            note: 'quote " and slash \\ together',
          },
        ],
      },
      tags: ['"double"', String.raw`back\slash`, 'forward/slash'],
      profile: {
        title: 'quotes and slashes',
        quote: 'She said "hello" and left.',
        sqlLike: String.raw`SELECT "value" FROM "table"\name`,
        jsonLike: String.raw`{"path":"C:\\Temp\\file.json","quote":"\""}`,
        dateLike: '2024-07-15T16:30:00.000Z',
        bigintLike: '9007199254740993',
        negativeBigintLike: '-9007199254740993',
        pathLike: String.raw`$.profile["title"]\raw`,
        whitespace: 'line one\nline two\r\nline three',
      },
      extra: {
        'space key': 'space value',
        'quote"key': 'quote"value',
      },
    },
  },
  {
    name: 'sql shaped strings',
    document: {
      name: "Robert'); DROP TABLE users;--",
      age: 27,
      address: {
        city: 'SELECT city FROM places',
        street: 'WHERE name = ? AND value = $1',
        history: [
          {
            street: 'ON CONFLICT(_id) DO UPDATE SET data = excluded.data',
            note: 'json_patch(data, \'{"title":"director\'s cut"}\')',
          },
        ],
      },
      tags: ['? placeholder', '$1 placeholder', '-- comment'],
      profile: {
        title: 'SQL text is still text',
        quote: "'); COMMIT; BEGIN; --",
        sqlLike: "INSERT INTO t VALUES ('director''s cut')",
        jsonLike: `{"sql":"SELECT 'literal'"}`,
        dateLike: '2024-07-15T16:30:00.000Z',
        bigintLike: '9007199254740993',
        negativeBigintLike: '-9007199254740993',
        pathLike: '$.unsafe[0]',
        whitespace: 'SELECT\n  1;\n-- newline comment',
      },
      extra: {
        'semicolon;key': 'semicolon;value',
        '$operator-looking': '$eq should stay a field value',
      },
    },
  },
  {
    name: 'json shaped strings',
    document: {
      name: '{"name":"not an object"}',
      age: 28,
      address: {
        city: '[1,true,null,"text"]',
        street: '{"street":{"nested":"value"}}',
        history: [
          {
            street: '{"array":[{"x":1}]}',
            note: '{"quote":"director\'s cut","slash":"\\\\"}',
          },
        ],
      },
      tags: ['{"tag":1}', '[false]', 'null'],
      profile: {
        title: 'json text stays a string',
        quote: '{"quoted":"yes"}',
        sqlLike: '{"sql":"SELECT * FROM users"}',
        jsonLike: '{"nested":{"array":[1,2,3],"bool":true}}',
        dateLike: '2024-07-15T16:30:00.000Z',
        bigintLike: '9007199254740993',
        negativeBigintLike: '-9007199254740993',
        pathLike: '$.jsonLike',
        whitespace: '{"multiline":"line one\\nline two"}',
      },
      extra: {
        '{brace}': '{value}',
        '[bracket]': '[value]',
      },
    },
  },
  {
    name: 'unicode alphabets and diacritics',
    document: {
      name: 'Zażółć gęślą jaźń Łódź Śląsk',
      age: 29,
      address: {
        city: 'São Tomé München Reykjavík Zürich',
        street: 'naïve façade coöperate soufflé',
        history: [
          { street: 'Αθήνα Ελληνικά', note: 'Привет мир' },
          { street: '東京 北京 서울', note: 'עברית العربية' },
        ],
      },
      tags: ['żółć', 'Ελλάδα', '東京', 'العربية'],
      profile: {
        title: 'Unicode stays intact',
        quote: 'Dvořák, Smørrebrød, Tromsø, Łukasz',
        sqlLike: 'SELECT Żółć FROM Łódź',
        jsonLike: '{"miasto":"Łódź","cafe":"São Tomé"}',
        dateLike: '2024-07-15T16:30:00.000Z',
        bigintLike: '9007199254740993',
        negativeBigintLike: '-9007199254740993',
        pathLike: '$.zażółć.gęślą',
        whitespace: 'pierwsza linia\ndruga linia',
      },
      extra: {
        'klucz-łódź': 'wartość-źdźbło',
        東京: '日本語',
      },
    },
  },
  {
    name: 'date and bigint shaped strings',
    document: {
      name: '2024-07-15T16:30:00.000Z',
      age: 30,
      address: {
        city: '9007199254740993',
        street: '-9007199254740993',
        history: [
          {
            street: '0000000000000001',
            note: '999999999999999999999999999999',
          },
        ],
      },
      tags: [
        '2024-07-15T16:30:00.000Z',
        '9007199254740993',
        '-9007199254740993',
      ],
      profile: {
        title: 'reviver-looking strings stay strings by default',
        quote: '271828182845904523536',
        sqlLike: '123456789012345678901234567890',
        jsonLike: '{"number":"9007199254740993"}',
        dateLike: '2024-07-15T16:30:00.000Z',
        bigintLike: '9007199254740993',
        negativeBigintLike: '-9007199254740993',
        pathLike: '$.profile.dateLike',
        whitespace: '2024-07-15T16:30:00.000Z\n9007199254740993',
      },
      extra: {
        'date-like-key': '2024-07-15T16:30:00.000Z',
        'bigint-like-key': '9007199254740993',
      },
    },
  },
  {
    name: 'json path shaped strings',
    document: {
      name: '$.address.history[0].street',
      age: 31,
      address: {
        city: '{address,city}',
        street: 'a.b.c[0] ? (@ == "value")',
        history: [
          {
            street: '$."quoted.key"[*]',
            note: '@."subKey" == "value" && @.count > 1',
          },
        ],
      },
      tags: ['$.tags[0]', '{tags,0}', 'data #>> {path}'],
      profile: {
        title: 'path text stays text',
        quote: '$.profile.quote',
        sqlLike: "jsonb_path_exists(data, '$.path[*]')",
        jsonLike: '{"path":"$.profile.title"}',
        dateLike: '2024-07-15T16:30:00.000Z',
        bigintLike: '9007199254740993',
        negativeBigintLike: '-9007199254740993',
        pathLike: '$.profile.pathLike[*] ? (@ == "x")',
        whitespace: '$.one\n$.two\t$.three',
      },
      extra: {
        'dot.key': 'dot.value',
        $pathKey: '$pathValue',
      },
    },
  },
  {
    name: 'control escapes and empty-ish strings',
    document: {
      name: '',
      age: 32,
      address: {
        city: ' ',
        street: '\t',
        history: [
          {
            street: 'line\bbackspace',
            note: 'form\ffeed and carriage\rreturn',
          },
        ],
      },
      tags: ['', ' ', '\t', '\n'],
      profile: {
        title: 'control escapes',
        quote: 'line one\nline two\tline three',
        sqlLike: '\r\n;\t--',
        jsonLike: '{"empty":"","space":" ","tab":"\\t"}',
        dateLike: '2024-07-15T16:30:00.000Z',
        bigintLike: '9007199254740993',
        negativeBigintLike: '-9007199254740993',
        pathLike: '$.profile.whitespace',
        whitespace: '\n\t\r\b\f',
      },
      extra: {
        empty: '',
        whitespace: ' \n\t ',
      },
    },
  },
] satisfies Array<{
  name: string;
  document: InsertOneSpecialCharacterDocument;
}>;

export const pickInsertOneRoundTripFields = (
  document: InsertOneSpecialCharacterDocument,
) => ({
  name: document.name,
  age: document.age,
  address: document.address,
  tags: document.tags,
  profile: document.profile,
  extra: document.extra,
});

export const cloneInsertOneSpecialCharacterDocument = (
  document: InsertOneSpecialCharacterDocument,
): InsertOneSpecialCharacterDocument =>
  JSON.parse(JSON.stringify(document)) as InsertOneSpecialCharacterDocument;
