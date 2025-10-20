module.exports = async function findSymptomNear(googleSheets, mealRef, { windowMin = 5 } = {}) {
  const row = await googleSheets.getMealRowByRef(mealRef);
  if (!row) return null;
  const since = new Date(new Date(row.Timestamp).getTime() - windowMin*60000).toISOString();
  const recent = await googleSheets.getRowsSince(mealRef.tab, since);
  return recent.find(r => r.Type === 'symptom' && (r.Notes||'').includes(row.Timestamp)) || null;
};
