// Server component: the equations are rendered to HTML on the server, so KaTeX never ships to the browser.
import katex from "katex";
import { PANEL, THRESHOLDS } from "@/lib/config";

const tex = (s: string) => katex.renderToString(s, { displayMode: true, throwOnError: false });
const n2 = (v: number) => v.toFixed(2);

const ITEMS = [
  {
    title: "Sunlight",
    text: "A small clean reference cell sits next to the panel. Its short-circuit current rises in step with sunlight, so it measures irradiance.",
    tex: String.raw`G = 1000\,\frac{I_{sc,\,ref}}{I_{sc,\,ref,\,STC}}`,
    rule: `Below ${THRESHOLDS.gMinDiag} W/m² there is too little light to diagnose.`,
  },
  {
    title: "Expected power",
    text: "The panel's rated power is scaled by the sunlight and corrected for temperature, because hot cells produce less.",
    tex: String.raw`P_{expected} = P_{STC}\,\frac{G}{1000}\left[1 + \gamma\,(T_c - 25)\right]`,
    rule: `Rated ${PANEL.pmaxStc} W, ${PANEL.vocStc} V, ${PANEL.iscStc} A, with γ = −0.4 %/°C.`,
  },
  {
    title: "Performance ratio",
    text: "Each I-V sweep finds the true maximum power and compares it with what the panel should give right now.",
    tex: String.raw`PR = \frac{P_{max}}{P_{expected}}`,
    rule: "A fall below 85 % of the calibrated value means low performance.",
  },
  {
    title: "Soiling index",
    text: "Dust blocks light on the panel but not on the clean reference cell, so the ratio of their currents drops.",
    tex: String.raw`SI = \frac{\dfrac{I_{panel}}{I_{ref}}}{\left(\dfrac{I_{panel}}{I_{ref}}\right)_{clean}}`,
    rule: `Dust below ${n2(THRESHOLDS.siDust)}, heavy dust below ${n2(THRESHOLDS.siHeavyDust)}.`,
  },
  {
    title: "Shading",
    text: "When part of the panel is shaded its bypass diode switches on, and the power curve grows a second peak.",
    tex: String.raw`\text{peaks on the } P\text{–}V \text{ curve} \;\geq\; 2`,
    rule: "A sudden soiling-index drop of more than 0.12 also flags shading.",
  },
  {
    title: "Diode fault and hot spot",
    text: "A failed bypass diode or cell string removes a large part of the voltage. Overheating is read from the back of the panel.",
    tex: String.raw`V_{oc} < 0.8\,V_{oc,\,expected} \qquad T_c > ${THRESHOLDS.tempHot}\,^{\circ}\mathrm{C}`,
    rule: "An open circuit is flagged when current falls below 5 % of the expected value.",
  },
];

export default function HowItWorks() {
  return (
    <section className="how" aria-labelledby="how-title">
      <div className="section-title">
        <h2 id="how-title">How the monitor decides</h2>
        <p className="muted">The rules the ESP32 applies to every reading and every I-V sweep.</p>
      </div>
      <div className="panel how-grid">
        {ITEMS.map((it) => (
          <article key={it.title} className="how-item">
            <h3>{it.title}</h3>
            <p>{it.text}</p>
            <div className="eq" dangerouslySetInnerHTML={{ __html: tex(it.tex) }} />
            <p className="rule">{it.rule}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
