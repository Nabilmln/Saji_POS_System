import english from "./en.json";

export type Locale = "id" | "en";
export type Values = Record<string, string | number>;

const dictionary = new Map(Object.entries(english));
const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const templates = [...dictionary].filter(([key]) => /\{\d+\}/.test(key)).map(([id, en]) => {
  const parameters = [...id.matchAll(/\{(\d+)\}/g)].map((match) => match[1]);
  const pattern = (value: string) => new RegExp(`^${value.split(/\{\d+\}/).map(escape).join("(.+?)")}$`);
  return { id, en, parameters, idPattern: pattern(id), enPattern: pattern(en) };
});
const reverse = new Map([...dictionary].map(([id, en]) => [en, id]));

export function readLocale(value: unknown): Locale {
  return value === "en" ? "en" : "id";
}

export function translate(locale: Locale, text: string, values: Values = {}): string {
  const source = dictionary.has(text) ? text : reverse.get(text) ?? text;
  let result = locale === "en" ? dictionary.get(source) ?? text : source;
  // Notices store rendered messages; recover their template when language changes.
  if (source === text && !dictionary.has(source)) {
    for (const template of templates) {
      const match = template.idPattern.exec(text) ?? template.enPattern.exec(text);
      if (!match) continue;
      result = locale === "en" ? template.en : template.id;
      values = Object.fromEntries(template.parameters.map((key, index) => [key, match[index + 1]]));
      break;
    }
  }
  return result.replace(/\{(\d+)\}/g, (token, key: string) => values[key] === undefined ? token : String(values[key]));
}
