import ezdxf, matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.backends.backend_pdf import PdfPages
from ezdxf.addons.drawing import RenderContext, Frontend
from ezdxf.addons.drawing.matplotlib import MatplotlibBackend
from ezdxf.addons.drawing.config import Configuration

doc = ezdxf.readfile("sources/6190_clean.dxf")
out = "/tmp/poc/6190_releve_topographique.pdf"

with PdfPages(out) as pdf:
    # ---- page 1: géomètre's full site survey sheet (paperspace) ----
    lay = doc.layout("Rez-de-chaussée")
    fig = plt.figure(); ax = fig.add_axes([0,0,1,1]); ax.set_axis_off()
    Frontend(RenderContext(doc), MatplotlibBackend(ax)).draw_layout(lay, finalize=True)
    x0,x1=ax.get_xlim(); y0,y1=ax.get_ylim(); w=x1-x0; h=y1-y0
    s=22.0/max(w,h); fig.set_size_inches(w*s, h*s)
    pdf.savefig(fig, dpi=300); plt.close(fig)

    # ---- page 2: zoom on buildings + immediate abords (modelspace window) ----
    msp = doc.modelspace()
    # freeze clutter layer
    for name in ("Topojis cachés",):
        if name in doc.layers: doc.layers.get(name).off()
    WIN = (116895, 120895, 117165, 121165)  # xmin,ymin,xmax,ymax (m)
    fig = plt.figure(); ax = fig.add_axes([0,0,1,1]); ax.set_axis_off()
    cfg = Configuration(background_policy=None) if False else Configuration()
    Frontend(RenderContext(doc), MatplotlibBackend(ax)).draw_layout(msp, finalize=False)
    ax.set_xlim(WIN[0], WIN[2]); ax.set_ylim(WIN[1], WIN[3]); ax.set_aspect('equal')
    fig.set_size_inches(16.5, 16.5*(WIN[3]-WIN[1])/(WIN[2]-WIN[0]))
    pdf.savefig(fig, dpi=300); plt.close(fig)

print("WROTE", out)
