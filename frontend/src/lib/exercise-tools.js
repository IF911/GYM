import { EXIDX, isAssisted } from './exercises.js'

// These categories describe work where a weight or plate stack is not a useful part of
// the exercise. Keep the category gate before config/override checks: old loadKind values
// must not resurrect controls for a jump, hold, or stretch.
export const TOOL_HIDDEN_CATEGORIES = new Set([
  'plyometrics', 'isometric', 'cardio', 'stretching', 'mobility', 'yoga', 'pilates', 'rehab', 'combat',
])

const ONE_RM_EQUIPMENT = new Set([
  'barbell', 'ez barbell', 'olympic barbell', 'trap bar', 'dumbbell', 'cable',
  'leverage machine', 'smith machine',
])
const PLATE_EQUIPMENT = new Set([
  'barbell', 'ez barbell', 'olympic barbell', 'trap bar', 'smith machine', 'weighted', 'sled machine',
])
const BODYWEIGHT_EQUIPMENT = new Set(['body weight', 'band', 'resistance band'])

const exerciseOf = value => {
  if (typeof value === 'string') return EXIDX[value] || { id: value }
  return value || {}
}

const modeOf = (ex, options) => options?.mode || ex.mode || 'reps'

/**
 * Decide which weight tools belong on an exercise surface.
 *
 * This is deliberately pure and only reads catalogue/config facts supplied by the caller.
 * `loadKind` is the effective value for the current config; `loadKindExplicit` lets a caller
 * distinguish a meaningful user choice on an otherwise ambiguous machine.
 */
export function exerciseToolPolicy(value, options = {}) {
  const ex = exerciseOf(value)
  const mode = modeOf(ex, options)
  const blocked = mode !== 'reps' || TOOL_HIDDEN_CATEGORIES.has(ex.cat)
  const assisted = isAssisted(ex)
  const bodyweight = options.bodyweight === true || (options.bodyweight == null && BODYWEIGHT_EQUIPMENT.has(ex.eq))
  const strengthLike = !ex.cat || ex.cat === 'strength' || ex.cat === 'olympic' || ex.cat === 'calisthenics'
  const explicitAddedLoad = options.bodyweight === false && options.hasMeaningfulLoad === true
  const loadedCalisthenics = ex.cat === 'calisthenics' && ex.eq === 'body weight' &&
    ex.bp !== 'waist' && explicitAddedLoad

  // A loaded calisthenics exercise is useful for 1RM only when the current config says it
  // carries added load. Ordinary bodyweight/core work remains quiet.
  const oneRM = !blocked && !assisted && strengthLike &&
    (ONE_RM_EQUIPMENT.has(ex.eq) || loadedCalisthenics || (!ex.eq && explicitAddedLoad))

  // Plates are physical loading aids. Dumbbells, kettlebells, cables, bands and pin stacks
  // have their own controls or no plate math. Lever machines are allowed only when the user
  // explicitly chose a suitable loading kind, because catalogue equipment is ambiguous.
  const plateByEquipment = PLATE_EQUIPMENT.has(ex.eq) ||
    (ex.eq === 'leverage machine' && options.loadKindExplicit === true) ||
    (!ex.eq && (options.loadKindExplicit === true || options.bodyweight === false)) ||
    (ex.eq === 'body weight' && options.hasMeaningfulLoad === true)
  const plates = !blocked && strengthLike && (!bodyweight || options.hasMeaningfulLoad === true) && plateByEquipment

  return { oneRM, plates, mode, category: ex.cat || '', equipment: ex.eq || '' }
}

export const canShowOneRM = (value, options) => exerciseToolPolicy(value, options).oneRM
export const canShowPlateLoading = (value, options) => exerciseToolPolicy(value, options).plates

