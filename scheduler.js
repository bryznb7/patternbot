//Fifteen 13
const DISCORD_WEBHOOK_URLFifteen = "https://discord.com/api/webhooks/1432708910602518618/M_14YE_pqVD1kdf8uOaeo0fysJ0Nkyktx50MuDI3lldScwxXEoN1tztk9S6ct71YDYBC";
function scheduleDiscordSend() {
  const now = new Date();
  const taipeiMinutes = (now.getUTCMinutes() + 8 * 60) % 60;
  const msToNext15 = (15 - (taipeiMinutes % 15)) * 60 * 1000
    - now.getUTCSeconds() * 1000
    - now.getUTCMilliseconds();

  setTimeout(async () => {
    if (matches.length) {
      await sendDiscordEmbed([...matches]);
      matches.length = 0;
    } else {
      log('No matches found.');
    }
    neutralCount = 0;
    scheduleDiscordSend();
  }, msToNext15 + 90000);

  log(`Wait ${Math.round(msToNext15 / (1000 * 60))}-min for the next candle`);
}

//Hour 13
const DISCORD_WEBHOOK_URL15 = "https://discord.com/api/webhooks/1432657847577088100/LrQTnqD0xlzOcZqiiws2mW6GjqJFodCHEYx_wy0FQWGHIBcuIa-w1_5fh5xqWwb29I1y";
function scheduleDiscordSend() {
  const now = new Date();
  const taipeiHour = (now.getUTCHours() + 8) % 24;
  const next = new Date(now);
  next.setUTCHours(now.getUTCHours() + 1, 0, 0, 0);
  const msToNextHour = next.getTime() - now.getTime();

  setTimeout(async () => {
    if (matches.length) {
      await sendDiscordEmbed([...matches]);
      matches.length = 0;
      neutralCount = 0;
    } else {
      log('No matches found.');
    }
    scheduleDiscordSend();
  }, msToNextHour + 90000);
  log(`Wait ${Math.round(msToNextHour / (1000 * 60))}-min for the next candle`);
}

//4 Hour 13
const DISCORD_WEBHOOK_URLFour = "https://discord.com/api/webhooks/1432633780778045541/xVI-rpCHfZKn2umm4ds1qdNirRgTim0SUV-FG_-qcH-gh30Oz415slaOvABaGrUcJzB9";
function scheduleDiscordSend() {
  const now = new Date();

  const taipeiNow = new Date(now.getTime() + 8 * 60 * 60 * 1000);

  const hours = taipeiNow.getUTCHours(); // hours in Taipei time (0–23)
  const nextBlockHour = Math.floor(hours / 4) * 4 + 4; // next 4h boundary (4, 8, 12, 16, 20, 24)
  const nextBlockTaipei = new Date(taipeiNow);

  // If crossing midnight, move to the next day
  if (nextBlockHour >= 24) {
    nextBlockTaipei.setUTCDate(taipeiNow.getUTCDate() + 1);
    nextBlockTaipei.setUTCHours(0, 0, 0, 0);
  } else {
    nextBlockTaipei.setUTCHours(nextBlockHour, 0, 0, 0);
  }

  // Convert back to UTC to get accurate difference
  const msToNext4Hour = nextBlockTaipei.getTime() - taipeiNow.getTime();

  setTimeout(async () => {
    if (matches.length) {
      await sendDiscordEmbed([...matches]);
      matches.length = 0;
      neutralCount = 0;
    }
    scheduleDiscordSend();
  }, msToNext4Hour + 90000);
  log(`Wait ${Math.round(msToNext4Hour / (1000 * 60 * 60))}-hour for the next candle`);
}

//Daily 13
const DISCORD_WEBHOOK_URLDaily = "https://discord.com/api/webhooks/1434892460206850069/1NdbPDfxmmBSV_6kvoYR7qT8wZbeWAtI8wuXFmaDt30eDaVK3_a7eDf-yDNzq8wAJMMn";
function scheduleDiscordSend() {
    const now = new Date();

    const taipeiNow = new Date(now.getTime() + 8 * 60 * 60 * 1000);

    const nextTargetTaipei = new Date(taipeiNow);
    nextTargetTaipei.setUTCHours(0, 0, 0, 0); // reset to 00:00 Taipei
    nextTargetTaipei.setUTCDate(taipeiNow.getUTCDate()); // start from today
    nextTargetTaipei.setUTCHours(8, 0, 0, 0); // set to 08:00 (Taipei local)

    // If current time already past 08:00 in Taipei, move to next day
    if (taipeiNow.getUTCHours() >= 8) {
        nextTargetTaipei.setUTCDate(nextTargetTaipei.getUTCDate() + 1);
    }

    // --- Compute time difference (milliseconds) ---
    const msToNext8AM = nextTargetTaipei.getTime() - taipeiNow.getTime();

    setTimeout(async () => {
        if (matches.length) {
            await sendDiscordEmbed([...matches]);
            matches.length = 0;
            neutralCount = 0;
        }
        scheduleDiscordSend();
    }, msToNext8AM + 90000);

    const hoursLeft = Math.floor(msToNext8AM / (1000 * 60 * 60));
    const minutesLeft = Math.floor((msToNext8AM % (1000 * 60 * 60)) / (1000 * 60));
    log(`Wait ${Math.round(hoursLeft)}-hour ${Math.round(minutesLeft)}-min for the next candle`);
}

//Weekly 8
const DISCORD_WEBHOOK_URLWeekly = "https://discord.com/api/webhooks/1437124448473055274/TklUH8747c85jkreu65csUnNwq2QzDparKklEoyiJw4yBpNtg6gyP7cZC6xiEMVM-85y";
function scheduleDiscordSend() {
    const now = new Date();
    const taipeiNow = new Date(now.getTime() + 8 * 60 * 60 * 1000);

    const nextTargetTaipei = new Date(taipeiNow);
    nextTargetTaipei.setUTCHours(0, 0, 0, 0); // reset hours
    nextTargetTaipei.setUTCDate(taipeiNow.getUTCDate()); // start from today

    // set time to 08:00 (Taipei local)
    nextTargetTaipei.setUTCHours(8, 0, 0, 0);

    // get current day (0=Sunday, 1=Monday, ..., 6=Saturday)
    const day = taipeiNow.getUTCDay();

    // If it's past 08:00 on Monday or any day after Monday → move to next Monday
    if (day > 1 || (day === 1 && taipeiNow.getUTCHours() >= 8)) {
        const daysToNextMonday = (8 - day) % 7 || 7; // days until next Monday
        nextTargetTaipei.setUTCDate(nextTargetTaipei.getUTCDate() + daysToNextMonday);
    } else if (day === 0) {
        // If today is Sunday → next day (Monday)
        nextTargetTaipei.setUTCDate(nextTargetTaipei.getUTCDate() + 1);
    }

    const msToNextMonday8AM = nextTargetTaipei.getTime() - taipeiNow.getTime();

    setTimeout(async () => {
        if (matches.length) {
            await sendDiscordEmbed([...matches]);
            matches.length = 0;
            neutralCount = 0;
        }
        scheduleDiscordSend();
    }, msToNextMonday8AM + 60000);

    const daysLeft = Math.floor(msToNextMonday8AM / (1000 * 60 * 60 * 24));
    const hoursLeft = Math.floor((msToNextMonday8AM % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutesLeft = Math.floor((msToNextMonday8AM % (1000 * 60 * 60)) / (1000 * 60));
    log(`Wait ${daysLeft}d ${hoursLeft}h ${minutesLeft}m for the next weekly candle`);
}

//Monthly 5
const DISCORD_WEBHOOK_URLMonthly = "https://discord.com/api/webhooks/1440367987528962048/J27rm6PBYnOoYk6DeVK8ODiBUiHkCXmFSm2mSYH4V6on0jgGTlh4bc7DnegY8-G80XG3";
function scheduleDiscordSend() {
    const now = new Date();
    const taipeiNow = new Date(now.getTime() + 8 * 60 * 60 * 1000);

    // --- Build the next target time (1st day of next month, 08:00 Taipei) ---
    const nextTargetTaipei = new Date(taipeiNow);
    nextTargetTaipei.setUTCHours(8, 0, 0, 0); // 08:00 (Taipei local)
    nextTargetTaipei.setUTCDate(1); // set to 1st day of the month

    // If current time is already past 08:00 on the 1st, move to next month
    if (
        taipeiNow.getUTCDate() > 1 ||
        (taipeiNow.getUTCDate() === 1 && taipeiNow.getUTCHours() >= 8)
    ) {
        nextTargetTaipei.setUTCMonth(nextTargetTaipei.getUTCMonth() + 1);
        nextTargetTaipei.setUTCDate(1);
        nextTargetTaipei.setUTCHours(8, 0, 0, 0);
    }

    // --- Calculate time difference ---
    const msToNextMonth = nextTargetTaipei.getTime() - taipeiNow.getTime();

    // --- Schedule the next execution ---
    setTimeout(async () => {
        if (matches.length) {
            await sendDiscordEmbed([...matches]);
            matches.length = 0;
            neutralCount = 0;
        }
        scheduleDiscordSend(); // reschedule for next month
    }, msToNextMonth + 60000); // 1-min delay buffer

    // --- Log readable countdown ---
    const daysLeft = Math.floor(msToNextMonth / (1000 * 60 * 60 * 24));
    const hoursLeft = Math.floor((msToNextMonth % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutesLeft = Math.floor((msToNextMonth % (1000 * 60 * 60)) / (1000 * 60));

    log(`Wait ${daysLeft}d ${hoursLeft}h ${minutesLeft}m until next monthly candle (08:00 Taipei)`);
}