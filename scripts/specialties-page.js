// Injected into index.html by scripts/import-specialties.js: computes every ship's marks with the
// app's own engine and writes them into the page for the runner to read back.
const result = document.createElement("pre");
result.textContent = `SPECIALTIES:${encodeURIComponent(JSON.stringify(computeShipSpecialties()))}:END`;
document.body.appendChild(result);
