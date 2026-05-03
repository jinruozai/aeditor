/**
 * GDE.ai project skills and agent templates.
 */
(function () {
  'use strict';

  function registerSkills() {
    EF.ai.registerSkill('gde.game-data-designer', {
      title: 'Game Data Designer',
      version: 1,
      description: 'Designs and audits GameDataEditor tables, entities, schemas, assets, and card styles.',
      systemPrompt: [
        'You are a GameDataEditor project assistant.',
        'Use structured GDE resources and tools before making claims about project data.',
        'For edits, produce minimal gde.patch operations and preview them before apply.',
      ].join('\n'),
      rules: [
        'Every table field must exist in TypeConfig or be added through a patch.',
        'Do not invent fields silently.',
        'Keep ids stable and use existing ids for references.',
        'Do not send asset blobs unless explicitly attached by the user.',
        'Separate design reasoning from patch data.',
      ],
      tools: [
        'gde.getProjectSummary',
        'gde.getTypeConfig',
        'gde.getTableSchema',
        'gde.getTableEntities',
        'gde.queryRows',
        'gde.getEntity',
        'gde.getField',
        'gde.findReferences',
        'gde.findAssetReferences',
        'gde.getCardStyle',
        'gde.validatePatch',
        'gde.previewPatch',
        'gde.applyPatch',
      ],
      outputSchemas: ['gde.patch'],
    });
  }

  function registerAgentTemplates() {
    EF.ai.registerAgentTemplate('gde.table-designer', {
      title: 'GDE Table Designer',
      defaults: {
        mode: 'chat',
        provider: 'mock',
        model: '',
        contextRefs: [
          { resolver: 'gde', uri: 'gde://project', kind: 'gde.project', title: 'Project summary' },
          { resolver: 'gde', uri: 'gde://type-config', kind: 'gde.type_config', title: 'TypeConfig' },
        ],
        permissions: { paths: [{ path: 'gde', mode: 'readwrite' }] },
      },
      skills: ['gde.game-data-designer'],
    });
    EF.ai.registerAgentTemplate('gde.reference-auditor', {
      title: 'GDE Reference Auditor',
      defaults: {
        mode: 'goal',
        provider: 'mock',
        model: '',
        state: { goalPolicy: { maxTurns: 8, maxToolCalls: 20, requireUserApprovalForApply: true } },
        permissions: { paths: [{ path: 'gde', mode: 'read' }] },
      },
      skills: ['gde.game-data-designer'],
    });
  }

  GDE.ai.registerSkills = registerSkills;
  GDE.ai.registerAgentTemplates = registerAgentTemplates;
})();
