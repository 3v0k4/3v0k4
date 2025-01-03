import fetch from "node-fetch";
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";

const DEXCOM_APPLICATION_ID = "d89443d2-327c-4a6f-89e5-496bbb0317db";
const TEMPLATE_PATH = "./README.templ.md";
const README_PATH = "./README.md";

const DEXCOM = {
  email: process.env.DEXCOM_EMAIL!!!,
  password: process.env.DEXCOM_PASSWORD!!!,
};

type Entry = {
  timestamp: string;
  estimatedValue: number | null;
};

const getAccountId = async (
  accountName: string,
  password: string
): Promise<string> => {
  const body = {
    accountName,
    password,
    applicationId: DEXCOM_APPLICATION_ID,
  };
  const url =
    "https://shareous1.dexcom.com/ShareWebServices/Services/General/AuthenticatePublisherAccount";
  return post(body, url) as Promise<string>;
};

const getSessionId = async (
  accountId: string,
  password: string
): Promise<string> => {
  const body = {
    accountId,
    password,
    applicationId: DEXCOM_APPLICATION_ID,
  };
  const url =
    "https://shareous1.dexcom.com/ShareWebServices/Services/General/LoginPublisherAccountById";
  return post(body, url) as Promise<string>;
};

const getEstimatedGlucoseValues = async (
  sessionId: string
): Promise<Entry[]> => {
  const body = {
    maxCount: 1,
    minutes: 6,
    sessionId,
  };
  const url =
    "https://shareous1.dexcom.com/ShareWebServices/Services/Publisher/ReadPublisherLatestGlucoseValues";
  // The API returns something like:
  // [{
  //   "WT":"Date(1649148591000)",
  //   "ST":"Date(1649148591000)",
  //   "DT":"Date(1649148591000+0200)",
  //   "Value":116,
  //   "Trend":"Flat"
  // }]
  const data = (await post(body, url)) as { Value: number; DT: string }[];
  const parsed = data.map((entry) => {
    const [_1, epochWithTz] = entry.DT.match(/Date\((.+)\)/)!!!;
    const [_2, timestamp] =
      convertToLocalTime(epochWithTz).match(/.+T(\d\d:\d\d):.+/)!!!;
    return {
      estimatedValue: entry.Value,
      timestamp,
    };
  });

  return parsed;
};

const post = async (
  body: Record<PropertyKey, unknown>,
  url: string
): Promise<unknown> => {
  try {
    const result = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (result.status !== 200) {
      throw new Error(`Status: ${result.status}`);
    }
    return await result.json();
  } catch (error) {
    throw new Error(`Request failed with error: ${error}`);
  }
};

const convertToLocalTime = (epochWithTz: string): string => {
  const [_, epoch, sign, offset] = epochWithTz.match(/(\d+)([-+])(\d+)/)!!!;
  const date = new Date(parseInt(epoch, 10));
  const iso =
    date.toISOString().slice(0, -1) + (sign === "-" ? "+" : "-") + offset;
  const dateInLocalTime = new Date(iso);
  return dateInLocalTime.toISOString().slice(0, -1) + `${sign}${offset}`;
};

const main = async () => {
  const accountId = await getAccountId(DEXCOM.email, DEXCOM.password);
  // `sessionId` seems to be valid for ~24 hours
  const sessionId = await getSessionId(accountId, DEXCOM.password);
  const entries = await getEstimatedGlucoseValues(sessionId);
  const template = readFileSync(TEMPLATE_PATH);
  const string =
    entries.length == 0
      ? "<strong>Last A1C: 5.14%</strong>"
      : `<strong>${entries[0].estimatedValue} mg/dl at ${entries[0].timestamp} CET</strong>`;
  const readme = template.toString().replace("<!--GLUCOSE-->", string);
  writeFileSync(README_PATH, readme);
};

// RUN

main();
