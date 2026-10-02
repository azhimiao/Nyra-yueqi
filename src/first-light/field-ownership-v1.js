/**
 * First Light field ledger. This is the migration/inspection contract; it
 * does not become a second runtime store.
 */

const formation = (targetField) => ({ domain: "CharacterFormationInput", targetField, compiler: "compileCharacterCore", mustNotAffect: ["relationship", "autonomy", "pet"] });
const relationship = (targetField) => ({ domain: "RelationshipSetup", targetField, compiler: "buildRelationshipContractV2", mustNotAffect: ["characterCore", "pet", "deviceGrants"] });
const autonomy = (targetField) => ({ domain: "AutonomyPreference", targetField, compiler: "AutonomyPolicyCompiler", mustNotAffect: ["characterCore", "relationshipType", "pet"] });
const flow = (targetField) => ({ domain: "transientFlow", targetField, compiler: "FirstLightFlowCompiler", mustNotAffect: ["characterCore", "relationship", "autonomy"] });

export const FIRST_LIGHT_FIELD_OWNERSHIP_V1 = Object.freeze({
  "character.name": formation("CharacterDefinition.name"),
  "character.genderIdentity": formation("CharacterDefinition.selfIdentity.genderIdentity"),
  "character.pronouns": formation("CharacterDefinition.selfIdentity.pronouns"),
  "preference.callUserAs": relationship("RelationshipInstance.userIdentity.callUserAs"),
  "preference.userPronouns": relationship("RelationshipInstance.userIdentity.pronouns"),
  "preference.relationshipType": relationship("RelationshipInstance.type"),
  "preference.relationshipStart": relationship("RelationshipInstance.startMode"),
  "preference.sharedHistory": relationship("RelationshipInstance.sharedHistoryHint"),
  "preference.purposes": relationship("RelationshipInstance.sharedPurposes"),
  "preference.supportStyle": relationship("RelationshipInstance.interaction.supportStyle"),
  "preference.initiativeStyle": relationship("RelationshipInstance.interaction.initiativeStyle"),
  "preference.conflictStyle": relationship("RelationshipInstance.interaction.conflictRepairStyle"),
  "preference.intimacyStyle": relationship("RelationshipInstance.interaction.intimacyStyle"),
  "preference.flirtLevel": relationship("RelationshipInstance.interaction.flirtLevel"),
  "preference.autonomyPreference": autonomy("AutonomyPolicy.preference"),
  "preference.nudgePolicy": autonomy("AutonomyPolicy.nudgePolicy"),
  "preference.allowProactive": autonomy("AutonomyPolicy.grants.proactiveMessage"),
  "preference.allowJealousy": relationship("RelationshipInstance.boundaries.allowJealousExpression"),
  "preference.quietHours": autonomy("AutonomyPolicy.quietHours"),
  "preference.hardBoundaries": relationship("RelationshipInstance.boundaries.userHardBoundaries"),
  "preference.autoDiary": autonomy("AutonomyPolicy.grants.autoDiary"),
  "preference.autoMoments": autonomy("AutonomyPolicy.grants.autoMoments"),
  "preference.values": formation("CharacterDefinition.persona.values"),
  "entryMode": flow("onboarding.entryMode"),
  "entryPath": flow("onboarding.entryPath"),
  "importedCharacterId": flow("onboarding.import.characterId"),
  "importDisposition": flow("onboarding.import.disposition"),
  "previewTone": flow("onboarding.preview.tone"),
  "previewFeedback": flow("onboarding.preview.feedback"),
  "appearanceDeferred": flow("onboarding.appearanceDeferred"),
});

export function firstLightFieldOwnershipSnapshot() {
  return Object.entries(FIRST_LIGHT_FIELD_OWNERSHIP_V1).map(([currentField, value]) => ({
    currentField,
    ...value,
    migrationRule: value.domain === "CharacterFormationInput"
      ? "explicit formation only; imported characters remain unchanged"
      : value.domain === "RelationshipSetup"
        ? "preserve explicit/default/skipped source; compile only into private preference"
        : value.domain === "AutonomyPreference"
          ? "each grant is checked independently; no implicit expansion"
          : "retain as audit metadata; never compile into runtime identity",
  }));
}

