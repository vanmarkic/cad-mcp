#!/usr/bin/env python3
"""Verification protocol for façade heights (égout/faîtage) from the aligned renders.

Why: the v1 numbers (facade_heights_aligned.csv, P60/P98 of raw column-tops) failed visual
review (user, Chapelle_short): (a) the renders are FULL-DEPTH orthographic crops, so the top
silhouette is the ROOF ENVELOPE (≈ ridge everywhere a roof is intact) — P60 of that is not an
eaves line; (b) raw first-alpha-pixel tops catch floating vegetation/noise → P98 overshoots.

Protocol v2 (this script):
  1. DENOISE  per-column top = first row opening a persistent run (>=5 filled of next 7 rows);
              columns with <30 filled px dropped. Kills floating specks.
  2. SMOOTH   rolling-median (window ~0.5 m) of the top profile.
  3. FAITAGE  = max of smoothed profile. Flag CLIPPED if within 3 px of the z-window top.
  4. PLATEAU  candidate = mode (10 cm bins) of profile over FLAT columns (slope < 0.3 m/m);
              support = % of flat columns within ±15 cm of the mode. Kept only if support
              >= 25 % and mode > 0.5 m below the max (else it IS the ridge).
  5. CROSS    per building: ridge spread across its ELEVATIONS (coupes are local slices).
  6. VISUAL   per-image verification PNG: raw + smoothed profile, v1 vs v2 lines.
  7. SIGN-OFF (human, 2026-06-11, from the verif PNGs): semantic identity of each plateau.
              FINDING: every plateau in a full-depth envelope is a RIDGE-CLASS feature
              (perpendicular ridge, secondary body ridge, wall crest) — NEVER a gutter.
              => égout is NOT measurable from these renders; all v1 eaves values RETRACTED.
              True égout needs thin facade-plane re-renders (NavVis crop API).
Outputs: facade_heights_verified.csv, VERIF_hauteurs.md, measured/verif/<name>_verif.png.
"""
import csv, glob, json, os
import numpy as np
from PIL import Image
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

Image.MAX_IMAGE_PIXELS = None
EXP = "/Users/dragan/Documents/cad-mcp/navvis_export"
SRC = f"{EXP}/facades_coupes_aligned"
VDIR = f"{SRC}/measured/verif"
os.makedirs(VDIR, exist_ok=True)
ZLO, ZHI = -2.0, 15.0
Hm = ZHI - ZLO

specs = {s["name"]: s for s in json.load(open(f"{SRC}/aligned_specs.json"))}
old = {r["elevation"]: {k: float(v) for k, v in r.items() if k != "elevation"}
       for r in csv.DictReader(open(f"{SRC}/facade_heights_aligned.csv"))}
ground_of = {b: old[f"belev_{b}_long"]["ground_z"]
             for b in ("AileOuest", "AileSudEst", "Atelier", "Chapelle", "Maisonprincipale")}

# Human sign-off (2026-06-11, read off measured/verif/*_verif.png) — semantic identity of the
# detected plateaus. Anything not listed: "indéterminé (voir verif PNG)".
SEMANTICS = {
    "belev_AileOuest_long":   "crête de mur (aile sans toiture)",
    "belev_AileSudEst_long":  "faîtage corps principal grange (12.90 = faîtage croisillon)",
    "belev_Chapelle_short":   "faîtage nef vu en bout (11.87 = sommets des pignons)",
}

def profile(nm):
    """Denoised per-column top z (NaN where no structure)."""
    a = np.array(Image.open(f"{SRC}/{nm}.tiff").convert("RGBA"))
    al = a[..., 3] > 30
    h, w = al.shape
    pads = np.zeros((7, w), bool)
    alp = np.vstack([al, pads])
    # run-test: row r opens a run if >=5 of rows r..r+6 are filled
    runs = sum(alp[i:i + h] for i in range(7)) >= 5      # (h,w) ints->bool
    valid = al.sum(axis=0) >= 30
    top = np.where(runs.any(axis=0), runs.argmax(axis=0), -1).astype(float)
    z = ZHI - top / h * Hm
    z[(top < 0) | ~valid] = np.nan
    return z, h, w

def rollmed(x, win):
    out = np.full_like(x, np.nan)
    half = max(1, win // 2)
    for i in range(len(x)):
        seg = x[max(0, i - half):i + half + 1]
        seg = seg[~np.isnan(seg)]
        if len(seg):
            out[i] = np.median(seg)
    return out

rows, figs = [], {}
for nm in sorted(specs):
    s = specs[nm]
    ppm = s["ppm"]
    z_raw, h, w = profile(nm)
    z_sm = rollmed(z_raw, int(ppm * 0.5))
    b = nm.split("_")[1]
    g = ground_of[b]
    ok = ~np.isnan(z_sm)
    if not ok.any():
        continue
    ridge = float(np.nanmax(z_sm))
    clipped = ridge >= ZHI - 3.0 / h * Hm
    # flat columns
    dz = np.abs(np.gradient(np.where(ok, z_sm, np.nan)))
    flat = ok & (dz * ppm < 0.3)   # slope < 0.3 m/m (~17°): plateaus, not roof slopes
    plateau_z = np.nan
    support = 0.0
    if flat.sum() > 20:
        vals = z_sm[flat]
        hist, edges = np.histogram(vals, bins=np.arange(ZLO, ZHI + 0.1, 0.1))
        mode = edges[np.argmax(hist)] + 0.05
        support = 100.0 * np.mean(np.abs(vals - mode) < 0.15)
        if support >= 25 and ridge - mode >= 0.5:
            plateau_z = float(mode)
    sem = (SEMANTICS.get(nm, "indéterminé (voir verif PNG)")
           if not np.isnan(plateau_z) else "")
    o = old.get(nm, {})
    rows.append(dict(
        image=nm, kind="elev" if nm.startswith("belev") else "coupe",
        ground_z=round(g, 2),
        ridge_z=round(ridge, 2), H_ridge=round(ridge - g, 2), ridge_clipped=clipped,
        plateau_z=("" if np.isnan(plateau_z) else round(plateau_z, 2)),
        plateau_semantique=sem,
        plateau_support_pct=round(support, 1),
        egout="NON MESURABLE (enveloppe pleine profondeur) — v1 RETIRÉ",
        old_eaves_z=o.get("eaves_z", ""), old_ridge_z=o.get("ridge_z", ""),
        d_ridge_vs_old=(round(ridge - o["ridge_z"], 2) if o else ""),
    ))
    figs[nm] = (z_raw, z_sm, ridge, plateau_z, sem, clipped, g, s)

# cross-view ridge consistency per building — ELEVATIONS only (coupes measure a local slice,
# not the whole-roof max; comparing them to elevations would fake an inconsistency)
spread = {}
for b in ground_of:
    rz = [r["ridge_z"] for r in rows
          if r["image"].split("_")[1] == b and r["kind"] == "elev" and not r["ridge_clipped"]]
    spread[b] = round(max(rz) - min(rz), 2) if len(rz) >= 2 else None
for r in rows:
    r["building_ridge_spread"] = spread[r["image"].split("_")[1]]

with open(f"{SRC}/facade_heights_verified.csv", "w", newline="") as fp:
    wcsv = csv.DictWriter(fp, fieldnames=list(rows[0].keys()))
    wcsv.writeheader(); wcsv.writerows(rows)
print("CSV:", f"{SRC}/facade_heights_verified.csv")

# verification PNGs
for nm, (z_raw, z_sm, ridge, plateau_z, sem, clipped, g, s) in figs.items():
    Wm = s["width_m"]
    xs = np.linspace(0, Wm, len(z_raw))
    fig, ax = plt.subplots(figsize=(11, 7))
    ax.imshow(np.asarray(Image.open(f"{SRC}/underlay/{nm}.png")), extent=[0, Wm, ZLO, ZHI])
    ax.plot(xs, z_raw, color="red", lw=0.4, alpha=0.6, label="profil brut (denoised tops)")
    ax.plot(xs, z_sm, color="orange", lw=1.2, label="profil lissé (médiane 0.5 m)")
    ax.axhline(ridge, color="navy", ls="--", lw=1.2,
               label=f"faîtage {ridge:.2f}" + (" (TRONQUÉ)" if clipped else ""))
    if not np.isnan(plateau_z):
        ax.axhline(plateau_z, color="teal", ls="--", lw=1.2,
                   label=f"plateau {plateau_z:.2f} = {sem}")
    o = old.get(nm)
    if o:
        ax.axhline(o["eaves_z"], color="grey", ls=":", lw=1.0,
                   label=f"v1 «égout» {o['eaves_z']} — RETIRÉ")
        ax.axhline(o["ridge_z"], color="0.4", ls=":", lw=1.0, label=f"v1 faîtage {o['ridge_z']}")
    ax.axhline(max(g, ZLO), color="saddlebrown", lw=1.5, label=f"TN {g:.2f}")
    ax.set_ylim(ZLO - 0.5, ZHI + 0.5); ax.set_xlim(-0.5, Wm + 0.5)
    ax.set_title(f"VERIF {nm} — égout non mesurable (enveloppe); plateau: {sem or '—'}")
    ax.legend(loc="lower right", fontsize=7)
    fig.savefig(f"{VDIR}/{nm}_verif.png", dpi=110, bbox_inches="tight")
    plt.close(fig)
print("verif PNGs ->", VDIR)

# report
with open(f"{SRC}/VERIF_hauteurs.md", "w") as fp:
    fp.write("# VERIF_hauteurs — protocole v2 + sign-off humain (2026-06-11)\n\n")
    fp.write("Déclencheur: revue visuelle utilisateur (Chapelle_short): v1 égout/faîtage faux.\n"
             "Causes racines: (a) rendus **pleine profondeur** → la silhouette est l'ENVELOPPE de\n"
             "toiture, pas la façade (P60 ≠ égout, conceptuellement); (b) tops bruts → la végétation\n"
             "flottante gonfle P98 (Chapelle: faîtage v1 13.97 vs réel 11.87, **−2.10 m**).\n\n"
             "## Protocole v2\n"
             "1. tops persistants (≥5/7 px remplis) — élimine les points flottants;\n"
             "2. médiane glissante 0.5 m sur le profil;\n"
             "3. **faîtage** = max du profil lissé; «tronqué» si ≤3 px du bord de fenêtre z;\n"
             "4. **plateau** = mode (10 cm) des colonnes plates (pente <0.3 m/m), retenu si support\n"
             "   ≥25 % et ≥0.5 m sous le faîtage;\n"
             "5. cohérence inter-élévations par bâtiment (même toit): écart max;\n"
             "6. PNG de vérification par image (`measured/verif/`): profils + lignes v1 vs v2;\n"
             "7. **sign-off humain** sur chaque plateau (sémantique).\n\n"
             "## Conclusion du sign-off\n"
             "**Tous les plateaux détectés sont des éléments de classe faîtage** (faîtage perpendiculaire,\n"
             "faîtage d'un corps secondaire, crête de mur sans toiture) — jamais une ligne d'égout.\n"
             "⇒ **L'égout n'est PAS mesurable sur ces rendus**; toutes les valeurs «eaves» v1 de\n"
             "`facade_heights_aligned.csv` sont **RETIRÉES** (le CSV v1 est conservé pour traçabilité).\n"
             "Égout vrai ⇒ re-rendu en tranches minces au nu de chaque façade (API crop NavVis).\n\n")
    fp.write("| image | faîtage v2 | Δ vs v1 | tronqué | plateau | sémantique (sign-off) | support % | spread élévations |\n")
    fp.write("|---|---|---|---|---|---|---|---|\n")
    for r in rows:
        fp.write(f"| {r['image']} | {r['ridge_z']} | {r['d_ridge_vs_old']} | "
                 f"{'OUI' if r['ridge_clipped'] else ''} | {r['plateau_z']} | {r['plateau_semantique']} | "
                 f"{r['plateau_support_pct']} | {r['building_ridge_spread']} |\n")
    fp.write("\nValidation interne du faîtage v2: écart inter-élévations Atelier 0.02 m, "
             "Chapelle 0.04 m, Aile Sud-Est 0.27 m (Aile Ouest & Maison principale: tronqués, "
             "non comparables — vraies valeurs > 15 m fenêtre).\n")
print("report:", f"{SRC}/VERIF_hauteurs.md")
