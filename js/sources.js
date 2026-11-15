// Quale dispositivo fornisce un dato quando ce n'è più d'uno. Funzioni pure (testabili).
// Regola: vince il sensore dedicato.
//   potenza: misuratore > rullo
//   cadenza: sensore di cadenza (CSC) > misuratore di potenza > rullo > stima dal volano
// `pref` è la scelta dell'utente ('auto' o una fonte); se la fonte scelta non c'è, si torna ad 'auto'.

/** @param {string} pref 'auto' | 'meter' | 'trainer'  @param {{meter:boolean, trainer:boolean}} have */
export function pickPower(pref, have) {
  if (pref === 'trainer' && have.trainer) return 'trainer';
  if (pref === 'meter' && have.meter) return 'meter';
  return have.meter ? 'meter' : 'trainer';
}

/** @param {string} pref 'auto' | 'csc' | 'meter' | 'trainer' | 'estimate'  @param {{csc:boolean, meter:boolean, trainer:boolean}} have */
export function pickCadence(pref, have) {
  if (pref === 'estimate') return 'estimate';
  if (pref !== 'auto' && have[pref]) return pref;
  if (have.csc) return 'csc';
  if (have.meter) return 'meter';
  if (have.trainer) return 'trainer';
  return 'estimate';
}

export const POWER_OPTIONS = ['auto', 'meter', 'trainer'];
export const CADENCE_OPTIONS = ['auto', 'csc', 'meter', 'trainer', 'estimate'];
