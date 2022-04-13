const robloxURL = "https://groups.roblox.com/v1/groups/1143446";

type DateMemberItem = [string, number, boolean?];

const verifyDataIntegrity = (data: string | DateMemberItem[]) => {
  if (typeof data === "string") {
    data = JSON.parse(data) as DateMemberItem[];
  }
  if (Array.isArray(data)) {
    if (data.length > 0) {
      if (typeof data[0][0] === "string" && typeof data[0][1] === "number") {
        return true;
      }
    } else {
      return true;
    }
  }
  return false;
};

const setCache = (data) => {
  if (verifyDataIntegrity(data)) {
    return MYS_GROWTH.put("data", data);
  } else {
    throw new Error("Data integrity check fail!");
  }
};

const getCache = () => MYS_GROWTH.get("data");

const setLastGoodBackup = (data) => {
  if (verifyDataIntegrity(data)) {
    return MYS_GROWTH.put("last_good_backup", data);
  } else {
    throw new Error("Data integrity check fail!");
  }
};

const getLastGoodBackup = () => MYS_GROWTH.get("last_good_backup");

async function backup(data) {
  const key = "data";
  const backupKey = `backup_${key}_${new Date().toISOString()}`;
  return MYS_GROWTH.put(backupKey, data);
}

async function getNewDataArray(response: Response, dateTimestamp: Date) {
  const { headers } = response;
  const contentType = headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    const json = (await response.json()) as any;
    const memberCount = parseInt(json.memberCount);
    if (memberCount) {
      const dateString = dateTimestamp.toISOString().substring(0, 10);
      const record: DateMemberItem = [dateString, memberCount];
      let data = await getCache();
      if (!verifyDataIntegrity(data)) {
        data = await getLastGoodBackup();
      }
      if (verifyDataIntegrity(data)) {
        const parsedData: DateMemberItem[] = JSON.parse(data);
        // Only add a new record if it doesnt exist for the given date already
        const recordExists = parsedData.some(
          (value: any) => value[0] === dateString
        );
        if (!recordExists) {
          parsedData.push(record);
        } else {
          console.log(`Record for ${dateString} already exists`);
        }
        return parsedData;
      } else {
        return [record];
      }
    }
  }
  throw new Error(`Unable to get latest data`);
}

async function updateCache(scheduledDate: number) {
  const dateTimestamp = new Date(scheduledDate);
  const init = {
    headers: {
      "content-type": "application/json;charset=UTF-8",
    },
  };
  const response = await fetch(robloxURL, init);
  const data = await getNewDataArray(response, dateTimestamp);
  console.log(data);
  const dateString = dateTimestamp.toISOString().substring(0, 10);
  const recordExists = data.some((value) => value[0] === dateString);
  if (verifyDataIntegrity(data)) {
    if (recordExists) {
      console.log(dateString + " - found, saving data...");
      const jsonData = JSON.stringify(data);
      await backup(jsonData);
      await setCache(jsonData);
      await setLastGoodBackup(jsonData);
    } else {
      throw new Error(dateString + " - current date not found in data!");
    }
  } else {
    throw new Error("Unable to verify data integrity!");
  }
}

async function handleSchedule(scheduledDate: number) {
  console.log(scheduledDate);
  await updateCache(scheduledDate);
}

addEventListener("scheduled", (event) => {
  event.waitUntil(handleSchedule(event.scheduledTime));
});

async function handleFetch(event: FetchEvent) {
  const data = await getCache();
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Content-Type": "application/json",
  };
  console.log(data);
  if (verifyDataIntegrity(data)) {
    return new Response(data, {
      headers: headers,
    });
  } else {
    const backup = await getLastGoodBackup();
    if (verifyDataIntegrity(backup)) {
      return new Response(backup, {
        headers: headers,
      });
    } else {
      await handleSchedule(new Date().getTime());
      const cache = await getCache();
      return new Response(cache, {
        headers: headers,
      });
    }
  }
}

addEventListener("fetch", (event) => {
  event.respondWith(handleFetch(event));
});
