// Same Jalali leap-year algorithm and supported bounds as the client calendar.
const breaks = [-61,9,38,199,426,686,756,818,1111,1181,1210,1635,2060,2097,2192,2262,2324,2394,2456,3178];
const div = (a,b) => Math.trunc(a/b);
const mod = (a,b) => a - div(a,b)*b;
function isLeap(year) {
  let previous = breaks[0], jump = 0;
  for (let i=1;i<breaks.length;i++) {
    const current=breaks[i];jump=current-previous;
    if (year<current) break;
    previous=current;
  }
  let n=year-previous;
  if (jump-n<6) n=n-jump+div(jump+4,33)*33;
  let leap=mod(mod(n+1,33)-1,4);
  if (leap===-1) leap=4;
  return leap===0;
}
export function isValidJalaliDate(key) {
  if (typeof key !== 'string' || !/^\d{4}\/(0[1-9]|1[0-2])\/(0[1-9]|[12][0-9]|3[01])$/.test(key)) return false;
  const [year,month,day]=key.split('/').map(Number);
  if (year < 0 || year >= 3178) return false;
  const maximum=month<=6?31:month<=11?30:isLeap(year)?30:29;
  return day<=maximum;
}
