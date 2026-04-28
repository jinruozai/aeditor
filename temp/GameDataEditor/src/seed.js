/**
 * Seed data — builtin TypeConfig + a small demo project.
 * The builtin TypeConfig is the source-of-truth for known types; project-level
 * TypeConfig (loaded from .gmdata) overrides individual fields on top.
 */
(function () {
  'use strict';

  // Project-specific compound types only. All primitive types (int/float/
  // string/struct/array/var/bool/color/date/img/snd/id/ref_id/enum_*/range_*/
  // percent) come from the framework's DEFAULT_BUILTIN — no duplication.
  var BUILTIN = {
    "id_num":     { name: "ID+Num",        base_type: "struct", type_render: "struct", default: [0,0],   mem: "Reference id + quantity",       struct_def: { id_num:     { id: "ref_id", num: "int" } } },
    "id_string":  { name: "ID+String",     base_type: "struct", type_render: "struct", default: [0,""],  mem: "Reference id + free text",      struct_def: { id_string:  { id: "ref_id", str: "string" } } },
    "string_num": { name: "String+Num",    base_type: "struct", type_render: "struct", default: ["",0],  mem: "Free text + quantity",          struct_def: { string_num: { str: "string", num: "int" } } },
    "img_num":    { name: "Image+Num",     base_type: "struct", type_render: "struct", default: ["",0],  mem: "Image asset + quantity",        struct_def: { img_num:    { img: "img", num: "int" } } },
    "snd_num":    { name: "Audio+Num",     base_type: "struct", type_render: "struct", default: ["",0],  mem: "Audio asset + quantity",        struct_def: { snd_num:    { snd: "snd", num: "int" } } },
    "img_string": { name: "Image+String",  base_type: "struct", type_render: "struct", default: ["",""], mem: "Image asset + label",           struct_def: { img_string: { img: "img", str: "string" } } },
    "snd_string": { name: "Audio+String",  base_type: "struct", type_render: "struct", default: ["",""], mem: "Audio asset + label",           struct_def: { snd_string: { snd: "snd", str: "string" } } }
  };

  // ───── Demo project ─────────────────────────────────────
  // A tiny RPG-ish dataset so the editor opens with something to click.
  function buildDemo() {
    // Project-level type extensions
    var projectTC = {
      "rarity_enum": {
        name: "Rarity", base_type: "int", type_render: "enum", default: 1,
        mem: "物品稀有度", type_agv: {
          options: { "1": "Common", "2": "Uncommon", "3": "Rare", "4": "Epic", "5": "Legendary" }
        }
      },
      "item_kind": {
        name: "ItemKind", base_type: "string", type_render: "enum", default: "weapon",
        mem: "物品大类", type_agv: {
          options: { "weapon": "Weapon", "armor": "Armor", "consumable": "Consumable", "material": "Material" }
        }
      }
    };

    var items = {
      struct_def: {
        "name":      { type: "string", mem: "Display name" },
        "icon":      { type: "img", mem: "Icon asset" },
        "kind":      { type: "item_kind", mem: "Category" },
        "rarity":    { type: "rarity_enum", mem: "Rarity tier" },
        "level":     { type: "range_int", mem: "Required level", type_agv: { min: 1, max: 60 } },
        "price":     { type: "int", mem: "Shop price" },
        "tint":      { type: "color", mem: "Icon tint" },
        "stackable": { type: "bool", mem: "Can stack in inventory" },
        "tags":      { type: "array", mem: "Freeform tags", type_agv: { elem_type: "string" } },
        "desc":      { type: "string", mem: "Description" }
      },
      entities: [
        { name: "Iron Sword",      icon: "https://picsum.photos/seed/iron-sword/200/200",   kind: "weapon",     rarity: 2, level: 5,  price: 120, tint: 0xC0C0C0, stackable: 0, tags: ["melee","sword"],     desc: "A reliable iron blade." },
        { name: "Steel Longsword", icon: "https://picsum.photos/seed/steel-longsword/200/200",   kind: "weapon",     rarity: 3, level: 15, price: 480, tint: 0xE0E8F0, stackable: 0, tags: ["melee","sword"],     desc: "Forged in the northern kilns." },
        { name: "Dragon Fang",     icon: "https://picsum.photos/seed/dragon-fang/200/200",  kind: "weapon",     rarity: 5, level: 45, price: 9999,tint: 0xFFB347, stackable: 0, tags: ["melee","legendary"], desc: "Said to be the tooth of a wyrm." },
        { name: "Healing Potion",  icon: "https://picsum.photos/seed/healing-potion/200/200",     kind: "consumable", rarity: 1, level: 1,  price: 20,  tint: 0xFF4444, stackable: 1, tags: ["potion","heal"],     desc: "Restores 50 HP." },
        { name: "Mana Elixir",     icon: "https://picsum.photos/seed/mana-elixir/200/200",    kind: "consumable", rarity: 2, level: 5,  price: 60,  tint: 0x4477FF, stackable: 1, tags: ["potion","mana"],     desc: "Restores 80 MP." },
        { name: "Leather Vest",    icon: "https://picsum.photos/seed/leather-vest/200/200",   kind: "armor",      rarity: 1, level: 3,  price: 90,  tint: 0x8B5A2B, stackable: 0, tags: ["light","chest"],     desc: "Basic leather protection." },
        { name: "Obsidian Plate",  icon: "https://picsum.photos/seed/obsidian-plate/200/200", kind: "armor",      rarity: 4, level: 30, price: 3200,tint: 0x222233, stackable: 0, tags: ["heavy","chest"],     desc: "Dark as a starless sky." },
        { name: "Iron Ore",        icon: "https://picsum.photos/seed/iron-ore/200/200",   kind: "material",   rarity: 1, level: 1,  price: 4,   tint: 0x808080, stackable: 1, tags: ["ore"],                desc: "Crafting material." },
        { name: "Mythril Nugget",  icon: "https://picsum.photos/seed/mythril-nugget/200/200",    kind: "material",   rarity: 4, level: 1,  price: 750, tint: 0x9FF0FF, stackable: 1, tags: ["ore","rare"],         desc: "Shines with an inner light." }
      ]
    };

    var characters = {
      struct_def: {
        "name":     { type: "string", mem: "Display name" },
        "portrait": { type: "img", mem: "Portrait" },
        "class":    { type: "enum_string", mem: "Class", type_agv: { options: { warrior:"Warrior", mage:"Mage", rogue:"Rogue", cleric:"Cleric" } } },
        "level":    { type: "range_int", mem: "Level", type_agv: { min: 1, max: 60 } },
        "hp":       { type: "int", mem: "Max HP" },
        "mp":       { type: "int", mem: "Max MP" },
        "crit":     { type: "percent", mem: "Crit rate" },
        "alive":    { type: "bool", mem: "Alive" },
        "starter":  { type: "ref_id", mem: "Starter item" },
        "bio":      { type: "string", mem: "Biography" }
      },
      entities: [
        { name: "Aria",   portrait: "https://i.pravatar.cc/150?img=47", class: "mage",    level: 12, hp: 340,  mp: 620, crit: 0.15, alive: 1, starter: 0, bio: "A prodigy of the crystal tower." },
        { name: "Borin",  portrait: "https://i.pravatar.cc/150?img=12", class: "warrior", level: 18, hp: 980,  mp: 120, crit: 0.08, alive: 1, starter: 0, bio: "Hill-folk warrior with a stubborn streak." },
        { name: "Celie",  portrait: "https://i.pravatar.cc/150?img=32", class: "rogue",   level: 10, hp: 420,  mp: 240, crit: 0.32, alive: 1, starter: 0, bio: "Vanished from three cities and counting." },
        { name: "Dara",   portrait: "https://i.pravatar.cc/150?img=49", class: "cleric",  level: 14, hp: 520,  mp: 540, crit: 0.10, alive: 0, starter: 0, bio: "Taken by the tides, they say." }
      ]
    };

    var shops = {
      struct_def: {
        "name":     { type: "string", mem: "Shop name" },
        "banner":   { type: "img", mem: "Banner image" },
        "open":     { type: "bool", mem: "Currently open" },
        "stock":    { type: "array", mem: "Items sold", type_agv: { elem_type: "id_num" } },
        "notes":    { type: "string", mem: "Notes" }
      },
      entities: [
        { name: "Old Town Arms",         banner: "https://picsum.photos/seed/old-town-arms/400/200", open: 1, stock: [[0,5],[0,2]],   notes: "Weekdays only." },
        { name: "Whispering Apothecary", banner: "https://picsum.photos/seed/apothecary/400/200",    open: 1, stock: [[0,99],[0,99]], notes: "Discount on potions Fridays." }
      ]
    };

    return { projectTC: projectTC, tables: { 'data/items': items, 'data/characters': characters, 'data/shops': shops } };
  }

  // Default cardStyle = 120×120 absolute card with the 'id' field shown
  // centered at the bottom. Shipped as the fallback every table inherits.
  function buildDemoCardStyles() {
    // Empty / null visual-style fields let the framework's CSS rules
    // (theme cascade) apply. The user can override per-cardStyle by
    // typing a real value into the inspector.
    return {
      'default': {
        name: 'Default',
        root: {
          id: 'root',
          type: 'absolute',
          props: { width: 120, height: 120 },
          bindings: {},
          children: [
            {
              id: 'id-text',
              type: 'text',
              props: { textAlign: 'center', size: 'sm' },
              bindings: { value: { source: 'field', field: 'id' } },
              layout: { anchor: 'bl', x: 0, y: 4, w: 120, h: 18, unit: 'px' },
              children: [],
            },
          ],
        },
      },
    };
  }

  function install() {
    State.setBuiltinTypeConfig(BUILTIN);
    var demo = buildDemo();
    State.setProjectTypeConfig(demo.projectTC);

    // Seed cardStyles. The 'default' is mandatory — every table that didn't
    // pick one falls back to it, so the grid always has *something* to show.
    State.setProjectCardStyles(buildDemoCardStyles());

    var tm = {};
    var gd = {};
    Object.keys(demo.tables).forEach(function (pathKey) {
      var t = demo.tables[pathKey];
      var ids = [];
      t.entities.forEach(function (e) {
        var id = State.genId();
        gd[id] = e;
        ids.push(id);
      });
      tm[pathKey] = { struct_def: t.struct_def, id: ids, card_style: 'default' };
    });
    // Wire first shop's stock[0].id to first item, and starter → Iron Sword
    var itemIds = tm['data/items'].id;
    var charIds = tm['data/characters'].id;
    var shopIds = tm['data/shops'].id;
    if (itemIds[0] && charIds.length) charIds.forEach(function (cid) { gd[cid].starter = itemIds[0]; });
    if (shopIds[0] && itemIds.length >= 2) {
      gd[shopIds[0]].stock = [[itemIds[0], 5], [itemIds[1], 2]];
    }
    if (shopIds[1] && itemIds.length >= 5) {
      gd[shopIds[1]].stock = [[itemIds[3], 99], [itemIds[4], 99]];
    }

    State.setGameData(gd);
    State.setTableMap(tm);
    State.projectName.set('Demo Project');
    Normalize.normalizeAll();
    State.log('info', 'Loaded demo project (' +
      Object.keys(tm).length + ' tables, ' + Object.keys(gd).length + ' entities)');
  }

  window.Seed = { install: install, BUILTIN: BUILTIN };
})();
