
const { Telegraf, Markup } = require("telegraf");
const fs = require("fs");
require("dotenv").config();

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;

if (!TOKEN) {
  console.error("XATO: .env faylida TELEGRAM_BOT_TOKEN topilmadi!");
  process.exit(1);
}

const bot = new Telegraf(TOKEN);

const USERS_FILE = "./users.json";
const ADMINS_FILE = "./admins.json";
const SETTINGS_FILE = "./settings.json";

const DEFAULT_SETTINGS = {
  profileUrl:
    "https://ovi.uz/ru/doctors/a7f7c7e4-22bc-4c3a-9ae4-ce6568582470?cl_link_id=5c16017e-05fe-4880-92ad-0cdfb668ad31",
  downloadUrl: "https://ovilink.chottu.link/zquxgV"
};

const states = new Map();

function ensureFile(file, initialValue) {
  if (!fs.existsSync(file)) {
    fs.writeFileSync(file, JSON.stringify(initialValue, null, 2));
  }
}

ensureFile(USERS_FILE, []);
ensureFile(ADMINS_FILE, []);
ensureFile(SETTINGS_FILE, DEFAULT_SETTINGS);

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (error) {
    console.error(`Faylni o'qishda xato: ${file}`, error.message);
    return fallback;
  }
}

function writeJson(file, value) {
  fs.writeFileSync(file, JSON.stringify(value, null, 2));
}

function getUsers() {
  return readJson(USERS_FILE, []);
}

function getAdmins() {
  return readJson(ADMINS_FILE, []);
}

function getSettings() {
  return {
    ...DEFAULT_SETTINGS,
    ...readJson(SETTINGS_FILE, DEFAULT_SETTINGS)
  };
}

function isAdmin(id) {
  return getAdmins().some((admin) => String(admin.id) === String(id));
}

function recordAction(user, action) {
  const users = getUsers();
  let item = users.find((entry) => String(entry.id) === String(user.id));
  const now = new Date().toISOString();

  if (!item) {
    item = {
      id: user.id,
      firstName: user.first_name || "",
      lastName: user.last_name || "",
      username: user.username || "",
      joinedAt: now,
      lastSeen: now,
      actions: []
    };
    users.push(item);
  }

  item.firstName = user.first_name || item.firstName;
  item.lastName = user.last_name || item.lastName;
  item.username = user.username || item.username;
  item.lastSeen = now;

  if (!Array.isArray(item.actions)) item.actions = [];

  item.actions.push({ action, time: now });

  // Har bir foydalanuvchi uchun oxirgi 500 ta harakat saqlanadi.
  item.actions = item.actions.slice(-500);

  writeJson(USERS_FILE, users);
}

function mainKeyboard(id) {
  const buttons = [
    [Markup.button.callback("🗳 Ovoz berish", "vote")],
    [Markup.button.callback("📥 OVI yuklash", "download")],
    [
      Markup.button.callback("📊 Statistika", "statistics"),
      Markup.button.callback("👤 Profil", "profile")
    ]
  ];

  if (isAdmin(id)) {
    buttons.push([
      Markup.button.callback("👑 Admin panel", "admin_panel")
    ]);
  }

  return Markup.inlineKeyboard(buttons);
}

function backKeyboard(destination = "home") {
  return Markup.inlineKeyboard([
    [Markup.button.callback("⬅️ Orqaga", destination)]
  ]);
}

function adminKeyboard() {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback("📊 Statistika", "admin_stats"),
      Markup.button.callback("👥 Foydalanuvchilar", "admin_users")
    ],
    [Markup.button.callback("📋 Harakatlar", "admin_actions")],
    [Markup.button.callback("📢 Xabar yuborish", "broadcast")],
    [
      Markup.button.callback("➕ Admin qo'shish", "add_admin"),
      Markup.button.callback("➖ Admin o'chirish", "remove_admin")
    ],
    [Markup.button.callback("🔗 Havolalarni boshqarish", "links")],
    [Markup.button.callback("🏠 Asosiy menyu", "home")]
  ]);
}

async function showHome(ctx, edit = false) {
  const text =
    `🏠 ASOSIY MENYU\n\n` +
    `Assalomu alaykum, ${ctx.from.first_name || "foydalanuvchi"}!\n\n` +
    `🎯 OVI botiga xush kelibsiz.\n` +
    `Kerakli bo'limni tanlang:`;

  const keyboard = mainKeyboard(ctx.from.id);

  if (edit && ctx.callbackQuery?.message) {
    try {
      await ctx.editMessageText(text, keyboard);
      return;
    } catch (error) {
      if (!String(error.description || "").includes("message is not modified")) {
        // Eski xabarni tahrirlab bo'lmasa, yangi xabar yuboriladi.
      } else {
        return;
      }
    }
  }

  await ctx.reply(text, keyboard);
}

async function safeEdit(ctx, text, keyboard) {
  try {
    await ctx.editMessageText(text, keyboard);
  } catch (error) {
    if (String(error.description || "").includes("message is not modified")) {
      return;
    }

    await ctx.reply(text, keyboard);
  }
}

async function requireAdmin(ctx) {
  if (isAdmin(ctx.from.id)) return true;

  await ctx.answerCbQuery("Bu bo'lim faqat adminlar uchun.", {
    show_alert: true
  });

  return false;
}

function getAllActions() {
  const actions = [];

  for (const user of getUsers()) {
    for (const action of user.actions || []) {
      actions.push({
        ...action,
        userId: user.id,
        name: user.firstName || "Noma'lum",
        username: user.username || ""
      });
    }
  }

  return actions.sort((a, b) => b.time.localeCompare(a.time));
}

bot.start(async (ctx) => {
  recordAction(ctx.from, "Botga start berdi");
  await showHome(ctx);
});

bot.command("id", async (ctx) => {
  await ctx.reply(`🆔 Sizning Telegram ID'ingiz: ${ctx.from.id}`);
});

bot.command("cancel", async (ctx) => {
  states.delete(ctx.from.id);
  await ctx.reply("❌ Amal bekor qilindi.");
});

bot.action("home", async (ctx) => {
  await ctx.answerCbQuery();
  recordAction(ctx.from, "Asosiy menyuni ochdi");
  await showHome(ctx, true);
});

bot.action("vote", async (ctx) => {
  await ctx.answerCbQuery();
  recordAction(ctx.from, "Ovoz berish bo'limini ochdi");

  const settings = getSettings();

  await safeEdit(
    ctx,
    "🗳 OVOZ BERISH\n\n" +
      "Quyidagi tugma orqali OVI profiliga o'ting.\n" +
      "Saytda ovoz berish imkoniyati mavjud bo'lsa, uni o'zingiz bajaring.\n\n" +
      "🔗 Havola:\n" +
      settings.profileUrl,
    Markup.inlineKeyboard([
      [Markup.button.url("🗳 OVOZ BERISH", settings.profileUrl)],
      [Markup.button.callback("⬅️ Orqaga", "home")]
    ])
  );
});

bot.action("download", async (ctx) => {
  await ctx.answerCbQuery();
  recordAction(ctx.from, "OVI yuklash bo'limini ochdi");

  const settings = getSettings();

  await safeEdit(
    ctx,
    "📥 OVI YUKLASH\n\n" +
      "Yuklash sahifasiga o'tish uchun quyidagi tugmani bosing.\n\n" +
      "🔗 Havola:\n" +
      settings.downloadUrl,
    Markup.inlineKeyboard([
      [Markup.button.url("📥 OVI YUKLASH", settings.downloadUrl)],
      [Markup.button.callback("⬅️ Orqaga", "home")]
    ])
  );
});

bot.action("statistics", async (ctx) => {
  await ctx.answerCbQuery();
  recordAction(ctx.from, "Statistika bo'limini ochdi");

  const users = getUsers();
  const today = new Date().toISOString().slice(0, 10);

  const joinedToday = users.filter(
    (user) => user.joinedAt?.slice(0, 10) === today
  ).length;

  const voteClicks = getAllActions().filter(
    (item) => item.action === "Ovoz berish bo'limini ochdi"
  ).length;

  const downloadClicks = getAllActions().filter(
    (item) => item.action === "OVI yuklash bo'limini ochdi"
  ).length;

  await safeEdit(
    ctx,
    "📊 BOT STATISTIKASI\n\n" +
      `👥 Jami foydalanuvchilar: ${users.length}\n` +
      `🆕 Bugun ro'yxatga olinganlar: ${joinedToday}\n` +
      `🗳 Ovoz bo'limi ochilgan: ${voteClicks}\n` +
      `📥 Yuklash bo'limi ochilgan: ${downloadClicks}`,
    backKeyboard()
  );
});

bot.action("profile", async (ctx) => {
  await ctx.answerCbQuery();
  recordAction(ctx.from, "Profil bo'limini ochdi");

  const user = getUsers().find(
    (item) => String(item.id) === String(ctx.from.id)
  );

  await safeEdit(
    ctx,
    "👤 SIZNING PROFILINGIZ\n\n" +
      `🆔 ID: ${ctx.from.id}\n` +
      `👤 Ism: ${ctx.from.first_name || "-"}\n` +
      `📝 Familiya: ${ctx.from.last_name || "-"}\n` +
      `🔗 Username: ${ctx.from.username ? "@" + ctx.from.username : "yo'q"}\n` +
      `📋 Qayd etilgan harakatlar: ${user?.actions?.length || 0}`,
    backKeyboard()
  );
});

bot.action("admin_panel", async (ctx) => {
  if (!(await requireAdmin(ctx))) return;

  await ctx.answerCbQuery();
  recordAction(ctx.from, "Admin panelini ochdi");

  await safeEdit(
    ctx,
    "👑 ADMIN PANEL\n\nKerakli boshqaruv bo'limini tanlang:",
    adminKeyboard()
  );
});

bot.action("admin_stats", async (ctx) => {
  if (!(await requireAdmin(ctx))) return;

  await ctx.answerCbQuery();

  const users = getUsers();
  const admins = getAdmins();
  const actions = getAllActions();
  const settings = getSettings();

  await safeEdit(
    ctx,
    "📊 ADMIN STATISTIKASI\n\n" +
      `👥 Foydalanuvchilar: ${users.length}\n` +
      `👑 Adminlar: ${admins.length}\n` +
      `📋 Qayd etilgan harakatlar: ${actions.length}\n\n` +
      `🗳 Ovoz havolasi:\n${settings.profileUrl}\n\n` +
      `📥 Yuklash havolasi:\n${settings.downloadUrl}`,
    backKeyboard("admin_panel")
  );
});

bot.action("admin_users", async (ctx) => {
  if (!(await requireAdmin(ctx))) return;

  await ctx.answerCbQuery();

  const users = getUsers().slice().reverse();

  if (!users.length) {
    await safeEdit(
      ctx,
      "👥 Hozircha foydalanuvchilar yo'q.",
      backKeyboard("admin_panel")
    );
    return;
  }

  let text = "👥 FOYDALANUVCHILAR (oxirgi 20 ta)\n\n";

  users.slice(0, 20).forEach((user, index) => {
    text += `${index + 1}. ${user.firstName || "Noma'lum"}\n`;
    text += `🆔 ${user.id}\n`;
    text += `🔗 ${user.username ? "@" + user.username : "username yo'q"}\n`;
    text += `📋 Harakatlar: ${user.actions?.length || 0}\n\n`;
  });

  await safeEdit(ctx, text, backKeyboard("admin_panel"));
});

bot.action("admin_actions", async (ctx) => {
  if (!(await requireAdmin(ctx))) return;

  await ctx.answerCbQuery();

  const actions = getAllActions().slice(0, 20);

  if (!actions.length) {
    await safeEdit(
      ctx,
      "📋 Hozircha harakatlar yo'q.",
      backKeyboard("admin_panel")
    );
    return;
  }

  let text = "📋 SO'NGGI 20 TA HARAKAT\n\n";

  actions.forEach((item, index) => {
    text += `${index + 1}. ${item.name} (ID: ${item.userId})\n`;
    text += `⚡ ${item.action}\n`;
    text += `🕒 ${new Date(item.time).toLocaleString("uz-UZ")}\n\n`;
  });

  await safeEdit(ctx, text, backKeyboard("admin_panel"));
});

bot.action("add_admin", async (ctx) => {
  if (!(await requireAdmin(ctx))) return;

  await ctx.answerCbQuery();
  states.set(ctx.from.id, { type: "add_admin" });

  await ctx.reply(
    "➕ YANGI ADMIN\n\nAdmin qilinadigan foydalanuvchining Telegram ID'sini yuboring.\n\n/cancel — bekor qilish"
  );
});

bot.action("remove_admin", async (ctx) => {
  if (!(await requireAdmin(ctx))) return;

  await ctx.answerCbQuery();
  states.set(ctx.from.id, { type: "remove_admin" });

  await ctx.reply(
    "➖ ADMINNI O'CHIRISH\n\nO'chiriladigan adminning Telegram ID'sini yuboring.\n\n/cancel — bekor qilish"
  );
});

bot.action("links", async (ctx) => {
  if (!(await requireAdmin(ctx))) return;

  await ctx.answerCbQuery();

  const settings = getSettings();

  await safeEdit(
    ctx,
    "🔗 HAVOLALARNI BOSHQARISH\n\n" +
      `🗳 Ovoz:\n${settings.profileUrl}\n\n` +
      `📥 Yuklash:\n${settings.downloadUrl}`,
    Markup.inlineKeyboard([
      [Markup.button.callback("🗳 Ovoz havolasini o'zgartirish", "change_vote_link")],
      [Markup.button.callback("📥 Yuklash havolasini o'zgartirish", "change_download_link")],
      [Markup.button.callback("⬅️ Admin panel", "admin_panel")]
    ])
  );
});

bot.action("change_vote_link", async (ctx) => {
  if (!(await requireAdmin(ctx))) return;

  await ctx.answerCbQuery();
  states.set(ctx.from.id, { type: "vote_link" });

  await ctx.reply("🗳 Yangi ovoz URL manzilini yuboring.\n\n/cancel — bekor qilish");
});

bot.action("change_download_link", async (ctx) => {
  if (!(await requireAdmin(ctx))) return;

  await ctx.answerCbQuery();
  states.set(ctx.from.id, { type: "download_link" });

  await ctx.reply("📥 Yangi yuklash URL manzilini yuboring.\n\n/cancel — bekor qilish");
});

bot.action("broadcast", async (ctx) => {
  if (!(await requireAdmin(ctx))) return;

  await ctx.answerCbQuery();
  states.set(ctx.from.id, { type: "broadcast" });

  await ctx.reply(
    "📢 FOYDALANUVCHILARGA XABAR\n\nYuboriladigan matnni yozing.\n\n/cancel — bekor qilish"
  );
});

bot.on("text", async (ctx) => {
  const id = ctx.from.id;
  const text = ctx.message.text.trim();
  const state = states.get(id);

  if (text === "/cancel") {
    states.delete(id);
    await ctx.reply("❌ Amal bekor qilindi.");
    return;
  }

  if (!state || !isAdmin(id)) return;

  if (state.type === "add_admin") {
    if (!/^\d+$/.test(text)) {
      await ctx.reply("❌ Faqat raqamli Telegram ID yuboring.");
      return;
    }

    const admins = getAdmins();

    if (admins.some((admin) => String(admin.id) === text)) {
      states.delete(id);
      await ctx.reply("ℹ️ Bu foydalanuvchi allaqachon admin.");
      return;
    }

    admins.push({
      id: Number(text),
      addedBy: id,
      addedAt: new Date().toISOString()
    });

    writeJson(ADMINS_FILE, admins);
    states.delete(id);

    recordAction(ctx.from, `Admin tayinladi: ${text}`);
    await ctx.reply(`✅ ${text} adminlar ro'yxatiga qo'shildi.`);
    return;
  }

  if (state.type === "remove_admin") {
    if (!/^\d+$/.test(text)) {
      await ctx.reply("❌ Faqat raqamli Telegram ID yuboring.");
      return;
    }

    if (String(id) === text) {
      await ctx.reply("❌ O'zingizni adminlikdan o'chira olmaysiz.");
      return;
    }

    const admins = getAdmins();
    const filtered = admins.filter((admin) => String(admin.id) !== text);

    if (filtered.length === admins.length) {
      states.delete(id);
      await ctx.reply("❌ Bu ID adminlar ro'yxatida topilmadi.");
      return;
    }

    writeJson(ADMINS_FILE, filtered);
    states.delete(id);

    recordAction(ctx.from, `Adminni o'chirdi: ${text}`);
    await ctx.reply(`✅ ${text} adminlikdan olib tashlandi.`);
    return;
  }

  if (state.type === "vote_link" || state.type === "download_link") {
    let url;

    try {
      url = new URL(text);
    } catch {
      await ctx.reply("❌ To'g'ri URL yuboring. Masalan: https://example.com");
      return;
    }

    if (!["http:", "https:"].includes(url.protocol)) {
      await ctx.reply("❌ Faqat http yoki https URL ishlatiladi.");
      return;
    }

    const settings = getSettings();

    if (state.type === "vote_link") {
      settings.profileUrl = url.toString();
    } else {
      settings.downloadUrl = url.toString();
    }

    writeJson(SETTINGS_FILE, settings);
    states.delete(id);

    recordAction(
      ctx.from,
      state.type === "vote_link"
        ? "Ovoz havolasini o'zgartirdi"
        : "Yuklash havolasini o'zgartirdi"
    );

    await ctx.reply("✅ Havola saqlandi.");
    return;
  }

  if (state.type === "broadcast") {
    states.delete(id);

    const users = getUsers();
    let sent = 0;
    let failed = 0;

    await ctx.reply("📢 Xabar yuborish boshlandi...");

    for (const user of users) {
      try {
        await bot.telegram.sendMessage(user.id, text);
        sent++;
      } catch {
        failed++;
      }
    }

    recordAction(ctx.from, `Xabar yuborish: ${sent} ta yetkazildi`);

    await ctx.reply(
      "📨 XABAR YUBORISH YAKUNLANDI\n\n" +
        `✅ Yetkazildi: ${sent}\n` +
        `❌ Yetkazilmadi: ${failed}`
    );
  }
});

bot.catch((error, ctx) => {
  console.error("BOT XATOSI:", error.message);

  if (ctx?.chat) {
    ctx.reply("⚠️ Xatolik yuz berdi. Birozdan keyin qayta urinib ko'ring.")
      .catch(() => {});
  }
});

bot.launch()
  .then(() => {
    console.log("🤖 OVI bot muvaffaqiyatli ishga tushdi!");
  })
  .catch((error) => {
    console.error("BOT ISHGA TUSHMADI:", error.message);
    process.exit(1);
  });

process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
