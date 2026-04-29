/**
 * Minimal i18n: English (default) + Chinese.
 * Usage:
 *   t('toolbar.save')  -> "Save" or "保存"
 *   I18N.locale is an EF signal; call I18N.setLocale('zh') to switch.
 *   I18N.onChange(fn) to subscribe.
 */
(function () {
  'use strict';

  var DICT = {
    en: {
      'app.title': 'GameDataEditor',

      // Top toolbar
      'toolbar.project': 'Project',
      'toolbar.new': 'New',
      'toolbar.open_folder': 'Open Folder...',
      'toolbar.recent': 'Open Recent',
      'toolbar.save': 'Save',
      'toolbar.save_as': 'Save As...',
      'toolbar.import_zip': 'Import...',
      'toolbar.export_zip': 'Export Zip...',
      'toolbar.theme': 'Theme',
      'toolbar.language': 'Language',
      'toolbar.lang.en': 'English',
      'toolbar.lang.zh': '中文',
      'toolbar.status.tables': 'Tables',
      'toolbar.status.entities': 'Entities',
      'toolbar.status.version': 'v',
      'toolbar.status.workspace': 'Workspace',
      'toolbar.status.project': 'Project',
      'toolbar.workspace.memory': 'Memory',
      'toolbar.recent.empty': '(No recent)',

      // TableMap panel
      'panel.tablemap': 'Tables',
      'tablemap.search_placeholder': 'Filter tables…',
      'tablemap.add_tooltip': 'Add new table',
      'tablemap.ctx.edit_struct': 'Edit struct_def',
      'tablemap.ctx.rename': 'Rename',
      'tablemap.ctx.delete': 'Delete',
      'tablemap.empty': 'No tables. Click + to add.',
      'tabbar.empty': 'No tables open · click a table in the sidebar',
      'log.collapse': 'Collapse',
      'log.expand': 'Expand',
      'tablemap.new_table_prompt': 'Table path (e.g. items/weapons):',
      'tablemap.rename_prompt': 'New path name:',
      'tablemap.delete_confirm': 'Delete table "{path}" and all its {n} entities?',

      // Search panel
      'panel.search': 'Search',
      // GameData panel
      'panel.gamedata': 'GameData',
      'gd.filter': 'Filter entities…',
      'gd.empty': 'No entities yet.',
      'gd.no_match': 'No matches.',
      'gd.truncated': 'Showing first {n}; refine filter to see more.',
      'search.placeholder': 'Search by ID or field value…',
      'search.empty': 'Type to search entities across all tables.',
      'search.no_results': 'No matches.',
      'search.result_count': '{n} results',

      // TypeConfig panel
      'panel.typeconfig': 'TypeConfig',
      'typeconfig.add': 'Add Type',
      'typeconfig.search_placeholder': 'Filter types…',
      'typeconfig.empty': 'No project-level types. Click + to create one.',
      'typeconfig.builtin_note': 'Built-in types (read-only)',
      'typeconfig.project_note': 'Project types',
      'typeconfig.edit_title': 'Edit TypeConfig',
      'typeconfig.new_title': 'New TypeConfig',
      'typeconfig.form.name': 'Name (key)',
      'typeconfig.form.display': 'Display name',
      'typeconfig.form.base_type': 'Base type',
      'typeconfig.form.render': 'Renderer',
      'typeconfig.form.default': 'Default value',
      'typeconfig.form.mem': 'Description',
      'typeconfig.form.type_agv': 'type_agv (JSON)',
      'typeconfig.ctx.edit': 'Edit',
      'typeconfig.ctx.delete': 'Delete',
      'typeconfig.delete_confirm': 'Delete type "{name}"?',
      'typeconfig.delete_in_use': 'Type "{name}" is used by {n} field(s). Force delete?',
      'typeconfig.force_delete': 'Force delete',

      // Table data panel
      'table.add': 'Add',
      'table.delete': 'Delete',
      'table.mode_card': 'Cards',
      'table.mode_list': 'List',
      'table.sort_by': 'Sort by',
      'table.sort_asc': 'Asc',
      'table.sort_desc': 'Desc',
      'table.card_size': 'Size',
      'table.selected_count': '{n} selected',
      'table.total_count': '{n} total',
      'table.empty': 'No entities. Click "Add" to create one.',
      'table.delete_confirm': 'Delete {n} selected entities?',
      'table.none_field': '(none)',

      // Inspector
      'panel.inspector': 'Inspector',
      'inspector.empty_title': 'No entity selected',
      'inspector.empty_hint': 'Select a card or row to edit its properties.',
      'inspector.id_label': 'ID',

      // Log
      'panel.log': 'Log',
      'log.clear': 'Clear',
      'log.copy': 'Copy',
      'log.filter': 'Filter…',
      'log.all': 'All',
      'log.info': 'Info',
      'log.warn': 'Warn',
      'log.error': 'Error',
      'log.empty': 'No log entries.',

      // Renderer placeholders
      'render.img_placeholder': 'image',
      'render.snd_placeholder': 'audio',
      'render.none': '(empty)',

      // Misc
      'common.ok': 'OK',
      'common.cancel': 'Cancel',
      'common.add': 'Add',
      'common.delete': 'Delete',
      'common.save': 'Save',
      'common.yes': 'Yes',
      'common.no': 'No',
    },
    zh: {
      'app.title': 'GameData 数据编辑器',

      'toolbar.project': '项目',
      'toolbar.new': '新建',
      'toolbar.open_folder': '打开目录...',
      'toolbar.recent': '打开最近',
      'toolbar.save': '保存',
      'toolbar.save_as': '另存为...',
      'toolbar.import_zip': '导入...',
      'toolbar.export_zip': '导出 zip...',
      'toolbar.theme': '主题',
      'toolbar.language': '语言',
      'toolbar.lang.en': 'English',
      'toolbar.lang.zh': '中文',
      'toolbar.status.tables': '表',
      'toolbar.status.entities': '实体',
      'toolbar.status.version': 'v',
      'toolbar.status.workspace': '工作区',
      'toolbar.status.project': '项目',
      'toolbar.workspace.memory': '内存',
      'toolbar.recent.empty': '（无）',

      'panel.tablemap': '表格',
      'tablemap.search_placeholder': '筛选表格…',
      'tablemap.add_tooltip': '添加新表',
      'tablemap.ctx.edit_struct': '修改 struct_def',
      'tablemap.ctx.rename': '重命名',
      'tablemap.ctx.delete': '删除',
      'tablemap.empty': '暂无表格，点击 + 添加。',
      'tabbar.empty': '未打开任何表格 · 点击左侧表格进入',
      'log.collapse': '收起',
      'log.expand': '展开',
      'tablemap.new_table_prompt': '表路径（如 items/weapons）：',
      'tablemap.rename_prompt': '新路径名：',
      'tablemap.delete_confirm': '删除表 "{path}" 及其 {n} 条数据？',

      'panel.search': '搜索',
      'panel.gamedata': '游戏数据',
      'gd.filter': '筛选实体…',
      'gd.empty': '暂无数据。',
      'gd.no_match': '无匹配项。',
      'gd.truncated': '已显示前 {n} 条，请细化筛选。',
      'search.placeholder': '按 ID 或字段值搜索…',
      'search.empty': '输入关键字以搜索所有表中的实体。',
      'search.no_results': '无匹配结果。',
      'search.result_count': '{n} 条结果',

      'panel.typeconfig': '类型配置',
      'typeconfig.add': '添加类型',
      'typeconfig.search_placeholder': '过滤类型…',
      'typeconfig.empty': '暂无项目类型，点击 + 创建。',
      'typeconfig.builtin_note': '内置类型（只读）',
      'typeconfig.project_note': '项目类型',
      'typeconfig.edit_title': '编辑类型',
      'typeconfig.new_title': '新建类型',
      'typeconfig.form.name': '名称（key）',
      'typeconfig.form.display': '显示名',
      'typeconfig.form.base_type': '基础类型',
      'typeconfig.form.render': '渲染器',
      'typeconfig.form.default': '默认值',
      'typeconfig.form.mem': '说明',
      'typeconfig.form.type_agv': 'type_agv（JSON）',
      'typeconfig.ctx.edit': '编辑',
      'typeconfig.ctx.delete': '删除',
      'typeconfig.delete_confirm': '删除类型 "{name}"？',
      'typeconfig.delete_in_use': '类型 "{name}" 被 {n} 个字段引用，是否强制删除？',
      'typeconfig.force_delete': '强制删除',

      'table.add': '添加',
      'table.delete': '删除',
      'table.mode_card': '卡片',
      'table.mode_list': '列表',
      'table.sort_by': '排序',
      'table.sort_asc': '升序',
      'table.sort_desc': '降序',
      'table.card_size': '大小',
      'table.selected_count': '已选 {n} 条',
      'table.total_count': '共 {n} 条',
      'table.empty': '暂无数据，点击"添加"创建。',
      'table.delete_confirm': '删除选中的 {n} 条数据？',
      'table.none_field': '（无）',

      'panel.inspector': '属性',
      'inspector.empty_title': '未选中实体',
      'inspector.empty_hint': '选择一张卡片或一行以编辑其属性。',
      'inspector.id_label': 'ID',

      'panel.log': '日志',
      'log.clear': '清空',
      'log.copy': '复制',
      'log.filter': '过滤…',
      'log.all': '全部',
      'log.info': '信息',
      'log.warn': '警告',
      'log.error': '错误',
      'log.empty': '暂无日志。',

      'render.img_placeholder': '图片',
      'render.snd_placeholder': '音频',
      'render.none': '（空）',

      'common.ok': '确定',
      'common.cancel': '取消',
      'common.add': '添加',
      'common.delete': '删除',
      'common.save': '保存',
      'common.yes': '是',
      'common.no': '否',
    },
  };

  var STORAGE_KEY = 'gde.locale';
  var initial = 'en';
  try {
    var saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'en' || saved === 'zh') initial = saved;
  } catch (_) {}

  var localeSig = EF.signal(initial);
  var listeners = [];

  function t(key, vars) {
    var loc = localeSig();
    var dict = DICT[loc] || DICT.en;
    var str = dict[key];
    if (str == null) str = DICT.en[key] || key;
    if (vars) {
      str = str.replace(/\{(\w+)\}/g, function (_, k) {
        return (vars[k] != null) ? vars[k] : '{' + k + '}';
      });
    }
    return str;
  }

  function setLocale(loc) {
    if (loc !== 'en' && loc !== 'zh') return;
    if (localeSig() === loc) return;
    localeSig(loc);
    try { localStorage.setItem(STORAGE_KEY, loc); } catch (_) {}
    listeners.slice().forEach(function (fn) { try { fn(loc); } catch (e) {} });
  }

  function onChange(fn) {
    listeners.push(fn);
    return function off() {
      var i = listeners.indexOf(fn);
      if (i >= 0) listeners.splice(i, 1);
    };
  }

  window.I18N = {
    t: t,
    setLocale: setLocale,
    getLocale: function () { return localeSig(); },
    locale: localeSig,
    onChange: onChange,
    LOCALES: ['en', 'zh'],
  };
  window.t = t;
})();
