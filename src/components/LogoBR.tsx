import { BR_BLEU, BR_JAUNE, LETTRES, LETTRES_D, MARGE_ORIGINE } from '../lib/logo'

// Logo BR (cadre bleu nuit, lettres jaunes), en vectoriel : net à toutes les tailles, sans chargement
export function LogoBR({ hauteur = 56, marge = MARGE_ORIGINE }: { hauteur?: number; marge?: number }) {
  const pad = LETTRES.hauteur * marge
  const w = LETTRES.largeur + 2 * pad
  const h = LETTRES.hauteur + 2 * pad
  return (
    <svg viewBox={`${-pad} ${-pad} ${w} ${h}`} height={hauteur} width={Math.round((hauteur * w) / h)} role="img" aria-label="BR" style={{ display: 'block', flex: 'none' }}>
      <rect x={-pad} y={-pad} width={w} height={h} fill={BR_BLEU} />
      <path d={LETTRES_D} fill={BR_JAUNE} fillRule="evenodd" />
    </svg>
  )
}
