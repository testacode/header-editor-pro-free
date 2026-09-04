// Message the popup sends to the background after every write.
//
// Dynamic declarativeNetRequest rules keep modifying traffic while the MV3
// service worker is asleep, and storage.onChanged is not a dependable wake-up.
// sendMessage always starts the worker, so this is what guarantees a pause or a
// disabled header actually reaches the rules.
export const APPLY_RULES_MESSAGE = 'headerEditor:applyRules';
