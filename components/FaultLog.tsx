import type { FaultEvent } from "@/lib/format";
import { fmtDuration, fmtTime } from "@/lib/format";
import { statusInfo } from "@/lib/status";
import { StatusIcon } from "./Icons";

type Props = { events: FaultEvent[]; now: number; rangeLabel: string };

export default function FaultLog({ events, now, rangeLabel }: Props) {
  return (
    <section className="panel log">
      <div className="section-head">
        <div>
          <h3>Fault log</h3>
          <p className="muted">{events.length === 0 ? `No faults in the ${rangeLabel}.`
            : `${events.length} fault event${events.length > 1 ? "s" : ""} in the ${rangeLabel}.`}</p>
        </div>
      </div>
      {events.length > 0 && (
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Fault</th><th>Started</th><th>Ended</th><th className="num">Duration</th><th>What to do</th></tr>
            </thead>
            <tbody>
              {events.map((e) => {
                const info = statusInfo(e.status);
                return (
                  <tr key={`${e.status}-${e.start}`}>
                    <td><span className="fault-name"><span className="lvl" data-level={info.level}>
                      <StatusIcon level={info.level} size={16} /></span>{info.label}</span></td>
                    <td>{fmtTime(e.start, true)}</td>
                    <td>{e.end ? fmtTime(e.end, true) : <span className="active-pill">Still active</span>}</td>
                    <td className="num">{fmtDuration((e.end ?? now) - e.start)}</td>
                    <td className="advice">{info.advice}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
