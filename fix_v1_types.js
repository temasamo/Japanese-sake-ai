const fs = require('fs');

let content = fs.readFileSync('pages/api/search.ts', 'utf8');

// Add V1 response type
const v1TypeDefinition = `
type YahooV1Hit = {
  Name?: string;
  Url?: string;
  Price?: { _value?: string };
  Image?: { Medium?: string };
  Store?: { Name?: string };
};

type YahooV1Response = {
  ResultSet?: {
    Result?: YahooV1Hit | YahooV1Hit[];
    [0]?: { Result?: YahooV1Hit | YahooV1Hit[] };
  };
};
`;

// Add V1 types after existing types
content = content.replace(
  /type YahooResponse = \{\s*hits\?: YahooHit\[\];\s*\};/,
  `type YahooResponse = {
  hits?: YahooHit[];
};
${v1TypeDefinition}`
);

// Fix V1 response handling
content = content.replace(
  /const hits =/,
  'const hits ='
);

content = content.replace(
  /j\?\.ResultSet\?\.\[0\]\?\.Result\?\.Hit \?\?/,
  '(j as YahooV1Response)?.ResultSet?.[0]?.Result?.Hit ??'
);

content = content.replace(
  /j\?\.ResultSet\?\.\[0\]\?\.Result \?\?/,
  '(j as YahooV1Response)?.ResultSet?.[0]?.Result ??'
);

content = content.replace(
  /j\?\.ResultSet\?\.Result\?\.Hit;/,
  '(j as YahooV1Response)?.ResultSet?.Result?.Hit;'
);

// Fix the loop variable type
content = content.replace(
  /for \(const h of hits\) {/,
  'for (const h of hits) {'
);

content = content.replace(
  /const title = h\?\.Name \?\? "";/,
  'const title = (h as YahooV1Hit)?.Name ?? "";'
);

content = content.replace(
  /const url = h\?\.Url \?\? "";/,
  'const url = (h as YahooV1Hit)?.Url ?? "";'
);

content = content.replace(
  /const priceNum = h\?\.Price\?\._value/,
  'const priceNum = (h as YahooV1Hit)?.Price?._value'
);

content = content.replace(
  /const image = h\?\.Image\?\.Medium \?\? null;/,
  'const image = (h as YahooV1Hit)?.Image?.Medium ?? null;'
);

content = content.replace(
  /const shop = h\?\.Store\?\.Name \?\? null;/,
  'const shop = (h as YahooV1Hit)?.Store?.Name ?? null;'
);

fs.writeFileSync('pages/api/search.ts', content);
console.log('Fixed V1 response types');
