/** Télécharge un objet en JSON lisible, sans passer par aucun serveur : le fichier est fabriqué dans le navigateur. */
export function downloadJson(filename: string, data: unknown): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  // En double-clic (file://), les URL « blob: » sont refusées : on utilise une URL « data: ».
  const url = window.location.protocol === 'file:' ? `data:application/json;charset=utf-8,${encodeURIComponent(JSON.stringify(data, null, 2))}` : URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}
