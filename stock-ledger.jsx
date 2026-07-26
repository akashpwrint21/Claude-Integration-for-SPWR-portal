import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Plus, Trash2, TrendingUp, TrendingDown, Minus, BookOpen, Loader2, RefreshCw, Download } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import * as XLSX from 'xlsx';

const FONTS = "@import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,600;9..144,700&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500;600;700&display=swap');";

const C = {
  bg: '#11151B',
  panel: '#171D25',
  panelAlt: '#1D2530',
  hairline: '#2A3340',
  hairline2: '#374252',
  text: '#EAE6DA',
  muted: '#8A93A3',
  faint: '#5B6473',
  gold: '#C8A24C',
  goldSoft: 'rgba(200,162,76,0.12)',
  pos: '#5FAE82',
  posSoft: 'rgba(95,174,130,0.12)',
  neg: '#DB6E52',
  negSoft: 'rgba(219,110,82,0.12)',
};

const serif = "'Fraunces', serif";
const sans = "'IBM Plex Sans', sans-serif";
const mono = "'IBM Plex Mono', monospace";

function uid() { return Math.random().toString(36).slice(2, 9); }
function today() { return new Date().toISOString().slice(0, 10); }
function num(v, d = 0) { const n = parseFloat(v); return isNaN(n) ? d : n; }
function fmtMoney(n) {
  if (n === null || n === undefined || isNaN(n)) return '—';
  return n.toLocaleString('en-IN', { maximumFractionDigits: 2, minimumFractionDigits: 2 });
}
function fmtPct(n, withSign = true) {
  if (n === null || n === undefined || isNaN(n)) return '—';
  const sign = n > 0 ? '+' : '';
  return `${withSign ? sign : ''}${n.toFixed(2)}%`;
}
function changeColor(n) {
  if (n === null || n === undefined || isNaN(n) || n === 0) return C.muted;
  return n > 0 ? C.pos : C.neg;
}
function isoWeekKey(dateStr) {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}
function monthKey(dateStr) { return dateStr.slice(0, 7); }
function monthLabel(key) {
  const [y, m] = key.split('-');
  return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
}
function weekLabel(key) {
  const [y, w] = key.split('-W');
  return `W${w} '${y.slice(2)}`;
}
function dateLabel(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
}
function mondayFromWeekKey(key) {
  const [yearStr, wStr] = key.split('-W');
  const year = Number(yearStr), week = Number(wStr);
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const jan4Day = jan4.getUTCDay() || 7;
  const week1Monday = new Date(jan4);
  week1Monday.setUTCDate(jan4.getUTCDate() - (jan4Day - 1));
  const monday = new Date(week1Monday);
  monday.setUTCDate(week1Monday.getUTCDate() + (week - 1) * 7);
  return monday;
}
function weekdayDates(key) {
  const monday = mondayFromWeekKey(key);
  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
  return days.map((label, i) => {
    const d = new Date(monday);
    d.setUTCDate(monday.getUTCDate() + i);
    const dateStr = d.toISOString().slice(0, 10);
    return { label, date: dateStr, short: d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }) };
  });
}

function buildTimeline(stockId, prices) {
  const map = prices[stockId] || {};
  return Object.keys(map).sort().map(date => ({ date, close: map[date] }));
}

function dailyReturnMap(timeline, entryPrice) {
  const out = {};
  let prev = entryPrice;
  timeline.forEach(pt => {
    out[pt.date] = prev ? ((pt.close - prev) / prev) * 100 : 0;
    prev = pt.close;
  });
  return out;
}

function periodReturns(series, baseline, keyFn, labelFn) {
  const map = new Map();
  series.forEach(pt => { map.set(keyFn(pt.date), pt); });
  let prev = baseline;
  const out = [];
  for (const [key, pt] of map.entries()) {
    const ret = prev ? ((pt.value - prev) / prev) * 100 : 0;
    out.push({ key, label: labelFn(key), date: pt.date, value: pt.value, return: ret });
    prev = pt.value;
  }
  return out;
}

function buildPortfolioTimeline(stocks, prices) {
  const allDates = new Set();
  stocks.forEach(s => Object.keys(prices[s.id] || {}).forEach(d => allDates.add(d)));
  const dates = [...allDates].sort();
  return dates.map(date => {
    let total = 0;
    stocks.forEach(s => {
      const sp = prices[s.id] || {};
      let close = null;
      Object.keys(sp).filter(d => d <= date).sort().forEach(d => { close = sp[d]; });
      const usedClose = close !== null ? close : s.entryPrice;
      total += usedClose * s.quantity;
    });
    return { date, value: total };
  });
}

// Full NSE-500 list (Nifty 500 index constituents) for the searchable Stock Name field.
// Covers ~500 companies representing ~92% of NSE free-float market cap. Anything outside
// this list (thinly-traded small caps, brand-new listings) can still be typed in freely.
const NSE_STOCKS = [
  ['360ONE', '360 ONE WAM'], ['3MINDIA', '3M India'], ['ABB', 'ABB India'], ['ACC', 'ACC'],
  ['AIAENG', 'AIA Engineering'], ['APLAPOLLO', 'APL Apollo Tubes'], ['AUBANK', 'AU Small Finance Bank'], ['AARTIIND', 'Aarti Industries'],
  ['AAVAS', 'Aavas Financiers'], ['ABBOTINDIA', 'Abbott India'], ['ACE', 'Action Construction Equipment'], ['ADANIENSOL', 'Adani Energy Solutions'],
  ['ADANIENT', 'Adani Enterprises'], ['ADANIGREEN', 'Adani Green Energy'], ['ADANIPORTS', 'Adani Ports and Special Economic Zone'], ['ADANIPOWER', 'Adani Power'],
  ['ATGL', 'Adani Total Gas'], ['AWL', 'Adani Wilmar'], ['ABCAPITAL', 'Aditya Birla Capital'], ['ABFRL', 'Aditya Birla Fashion and Retail'],
  ['AEGISLOG', 'Aegis Logistics'], ['AETHER', 'Aether Industries'], ['AFFLE', 'Affle (India)'], ['AJANTPHARM', 'Ajanta Pharmaceuticals'],
  ['APLLTD', 'Alembic Pharmaceuticals'], ['ALKEM', 'Alkem Laboratories'], ['ALKYLAMINE', 'Alkyl Amines Chemicals'], ['ALLCARGO', 'Allcargo Logistics'],
  ['ALOKINDS', 'Alok Industries'], ['ARE&M', 'Amara Raja Energy & Mobility'], ['AMBER', 'Amber Enterprises India'], ['AMBUJACEM', 'Ambuja Cements'],
  ['ANANDRATHI', 'Anand Rathi Wealth'], ['ANGELONE', 'Angel One'], ['ANURAS', 'Anupam Rasayan India'], ['APARINDS', 'Apar Industries'],
  ['APOLLOHOSP', 'Apollo Hospitals Enterprise'], ['APOLLOTYRE', 'Apollo Tyres'], ['APTUS', 'Aptus Value Housing Finance India'], ['ACI', 'Archean Chemical Industries'],
  ['ASAHIINDIA', 'Asahi India Glass'], ['ASHOKLEY', 'Ashok Leyland'], ['ASIANPAINT', 'Asian Paints'], ['ASTERDM', 'Aster DM Healthcare'],
  ['ASTRAZEN', 'AstraZenca Pharma India'], ['ASTRAL', 'Astral'], ['ATUL', 'Atul'], ['AUROPHARMA', 'Aurobindo Pharma'],
  ['AVANTIFEED', 'Avanti Feeds'], ['DMART', 'Avenue Supermarts'], ['AXISBANK', 'Axis Bank'], ['BEML', 'BEML'],
  ['BLS', 'BLS International Services'], ['BSE', 'BSE'], ['BAJAJ-AUTO', 'Bajaj Auto'], ['BAJFINANCE', 'Bajaj Finance'],
  ['BAJAJFINSV', 'Bajaj Finserv'], ['BAJAJHLDNG', 'Bajaj Holdings & Investment'], ['BALAMINES', 'Balaji Amines'], ['BALKRISIND', 'Balkrishna Industries'],
  ['BALRAMCHIN', 'Balrampur Chini Mills'], ['BANDHANBNK', 'Bandhan Bank'], ['BANKBARODA', 'Bank of Baroda'], ['BANKINDIA', 'Bank of India'],
  ['MAHABANK', 'Bank of Maharashtra'], ['BATAINDIA', 'Bata India'], ['BAYERCROP', 'Bayer Cropscience'], ['BERGEPAINT', 'Berger Paints India'],
  ['BDL', 'Bharat Dynamics'], ['BEL', 'Bharat Electronics'], ['BHARATFORG', 'Bharat Forge'], ['BHEL', 'Bharat Heavy Electricals'],
  ['BPCL', 'Bharat Petroleum Corporation'], ['BHARTIARTL', 'Bharti Airtel'], ['BIKAJI', 'Bikaji Foods International'], ['BIOCON', 'Biocon'],
  ['BIRLACORPN', 'Birla Corporation'], ['BSOFT', 'Birlasoft'], ['BLUEDART', 'Blue Dart Express'], ['BLUESTARCO', 'Blue Star'],
  ['BBTC', 'Bombay Burmah Trading Corporation'], ['BORORENEW', 'Borosil Renewables'], ['BOSCHLTD', 'Bosch'], ['BRIGADE', 'Brigade Enterprises'],
  ['BRITANNIA', 'Britannia Industries'], ['MAPMYINDIA', 'C.E. Info Systems'], ['CCL', 'CCL Products (I)'], ['CESC', 'CESC'],
  ['CGPOWER', 'CG Power and Industrial Solutions'], ['CIEINDIA', 'CIE Automotive India'], ['CRISIL', 'CRISIL'], ['CSBBANK', 'CSB Bank'],
  ['CAMPUS', 'Campus Activewear'], ['CANFINHOME', 'Can Fin Homes'], ['CANBK', 'Canara Bank'], ['CAPLIPOINT', 'Caplin Point Laboratories'],
  ['CGCL', 'Capri Global Capital'], ['CARBORUNIV', 'Carborundum Universal'], ['CASTROLIND', 'Castrol India'], ['CEATLTD', 'Ceat'],
  ['CELLO', 'Cello World'], ['CENTRALBK', 'Central Bank of India'], ['CDSL', 'Central Depository Services (India)'], ['CENTURYPLY', 'Century Plyboards (India)'],
  ['ABREL', 'Aditya Birla Real Estate'], ['CERA', 'Cera Sanitaryware'], ['CHALET', 'Chalet Hotels'], ['CHAMBLFERT', 'Chambal Fertilizers & Chemicals'],
  ['CHEMPLASTS', 'Chemplast Sanmar'], ['CHENNPETRO', 'Chennai Petroleum Corporation'], ['CHOLAHLDNG', 'Cholamandalam Financial Holdings'], ['CHOLAFIN', 'Cholamandalam Investment and Finance Company'],
  ['CIPLA', 'Cipla'], ['CUB', 'City Union Bank'], ['CLEAN', 'Clean Science and Technology'], ['COALINDIA', 'Coal India'],
  ['COCHINSHIP', 'Cochin Shipyard'], ['COFORGE', 'Coforge'], ['COLPAL', 'Colgate Palmolive (India)'], ['CAMS', 'Computer Age Management Services'],
  ['CONCORDBIO', 'Concord Biotech'], ['CONCOR', 'Container Corporation of India'], ['COROMANDEL', 'Coromandel International'], ['CRAFTSMAN', 'Craftsman Automation'],
  ['CREDITACC', 'CreditAccess Grameen'], ['CROMPTON', 'Crompton Greaves Consumer Electricals'], ['CUMMINSIND', 'Cummins India'], ['CYIENT', 'Cyient'],
  ['DCMSHRIRAM', 'DCM Shriram'], ['DLF', 'DLF'], ['DOMS', 'DOMS Industries'], ['DABUR', 'Dabur India'],
  ['DALBHARAT', 'Dalmia Bharat'], ['DATAPATTNS', 'Data Patterns (India)'], ['DEEPAKFERT', 'Deepak Fertilisers & Petrochemicals Corp.'], ['DEEPAKNTR', 'Deepak Nitrite'],
  ['DELHIVERY', 'Delhivery'], ['DEVYANI', 'Devyani International'], ['DIVISLAB', 'Divi\'s Laboratories'], ['DIXON', 'Dixon Technologies (India)'],
  ['LALPATHLAB', 'Dr. Lal Path Labs'], ['DRREDDY', 'Dr. Reddy\'s Laboratories'], ['EIDPARRY', 'E.I.D. Parry (India)'], ['EIHOTEL', 'EIH'],
  ['EPL', 'EPL'], ['EASEMYTRIP', 'Easy Trip Planners'], ['EICHERMOT', 'Eicher Motors'], ['ELECON', 'Elecon Engineering Co.'],
  ['ELGIEQUIP', 'Elgi Equipments'], ['EMAMILTD', 'Emami'], ['ENDURANCE', 'Endurance Technologies'], ['ENGINERSIN', 'Engineers India'],
  ['EQUITASBNK', 'Equitas Small Finance Bank'], ['ERIS', 'Eris Lifesciences'], ['ESCORTS', 'Escorts Kubota'], ['EXIDEIND', 'Exide Industries'],
  ['FDC', 'FDC'], ['NYKAA', 'FSN E-Commerce Ventures'], ['FEDERALBNK', 'Federal Bank'], ['FACT', 'Fertilisers and Chemicals Travancore'],
  ['FINEORG', 'Fine Organic Industries'], ['FINCABLES', 'Finolex Cables'], ['FINPIPE', 'Finolex Industries'], ['FSL', 'Firstsource Solutions'],
  ['FIVESTAR', 'Five-Star Business Finance'], ['FORTIS', 'Fortis Healthcare'], ['GAIL', 'GAIL (India)'], ['GMMPFAUDLR', 'GMM Pfaudler'],
  ['GMRINFRASTRUCT', 'GMR Airports Infrastructure'], ['GRSE', 'Garden Reach Shipbuilders & Engineers'], ['GICRE', 'General Insurance Corporation of India'], ['GILLETTE', 'Gillette India'],
  ['GLAND', 'Gland Pharma'], ['GLAXO', 'Glaxosmithkline Pharmaceuticals'], ['ALIVUS', 'Glenmark Life Sciences'], ['GLENMARK', 'Glenmark Pharmaceuticals'],
  ['MEDANTA', 'Global Health'], ['GPIL', 'Godawari Power & Ispat'], ['GODFRYPHLP', 'Godfrey Phillips India'], ['GODREJCP', 'Godrej Consumer Products'],
  ['GODREJIND', 'Godrej Industries'], ['GODREJPROP', 'Godrej Properties'], ['GRANULES', 'Granules India'], ['GRAPHITE', 'Graphite India'],
  ['GRASIM', 'Grasim Industries'], ['GESHIP', 'Great Eastern Shipping Co.'], ['GRINDWELL', 'Grindwell Norton'], ['GAEL', 'Gujarat Ambuja Exports'],
  ['FLUOROCHEM', 'Gujarat Fluorochemicals'], ['GUJGASLTD', 'Gujarat Gas'], ['GMDCLTD', 'Gujarat Mineral Development Corporation'], ['GNFC', 'Gujarat Narmada Valley Fertilizers and Chemicals'],
  ['GPPL', 'Gujarat Pipavav Port'], ['GSFC', 'Gujarat State Fertilizers & Chemicals'], ['GSPL', 'Gujarat State Petronet'], ['HEG', 'H.E.G.'],
  ['HBLENGINE', 'HBL Power Systems'], ['HCLTECH', 'HCL Technologies'], ['HDFCAMC', 'HDFC Asset Management Company'], ['HDFCBANK', 'HDFC Bank'],
  ['HDFCLIFE', 'HDFC Life Insurance Company'], ['HFCL', 'HFCL'], ['HAPPSTMNDS', 'Happiest Minds Technologies'], ['HAPPYFORGE', 'Happy Forgings'],
  ['HAVELLS', 'Havells India'], ['HEROMOTOCO', 'Hero MotoCorp'], ['HSCL', 'Himadri Speciality Chemical'], ['HINDALCO', 'Hindalco Industries'],
  ['HAL', 'Hindustan Aeronautics'], ['HINDCOPPER', 'Hindustan Copper'], ['HINDPETRO', 'Hindustan Petroleum Corporation'], ['HINDUNILVR', 'Hindustan Unilever'],
  ['HINDZINC', 'Hindustan Zinc'], ['POWERINDIA', 'Hitachi Energy India'], ['HOMEFIRST', 'Home First Finance Company India'], ['HONASA', 'Honasa Consumer'],
  ['HONAUT', 'Honeywell Automation India'], ['HUDCO', 'Housing & Urban Development Corporation'], ['ICICIBANK', 'ICICI Bank'], ['ICICIGI', 'ICICI Lombard General Insurance Company'],
  ['ICICIPRULI', 'ICICI Prudential Life Insurance Company'], ['ISEC', 'ICICI Securities'], ['IDBI', 'IDBI Bank'], ['IDFCFIRSTB', 'IDFC First Bank'],
  ['IFCI', 'IFCI'], ['IIFL', 'IIFL Finance'], ['IRB', 'IRB Infrastructure Developers'], ['IRCON', 'IRCON International'],
  ['ITC', 'ITC'], ['ITI', 'ITI'], ['INDIACEM', 'India Cements'], ['INDIAMART', 'Indiamart Intermesh'],
  ['INDIANB', 'Indian Bank'], ['IEX', 'Indian Energy Exchange'], ['INDHOTEL', 'Indian Hotels Co.'], ['IOC', 'Indian Oil Corporation'],
  ['IOB', 'Indian Overseas Bank'], ['IRCTC', 'Indian Railway Catering And Tourism Corporation'], ['IRFC', 'Indian Railway Finance Corporation'], ['INDIGOPNTS', 'Indigo Paints'],
  ['IGL', 'Indraprastha Gas'], ['INDUSTOWER', 'Indus Towers'], ['INDUSINDBK', 'IndusInd Bank'], ['NAUKRI', 'Info Edge (India)'],
  ['INFY', 'Infosys'], ['INOXWIND', 'Inox Wind'], ['INTELLECT', 'Intellect Design Arena'], ['INDIGO', 'InterGlobe Aviation'],
  ['IPCALAB', 'Ipca Laboratories'], ['JBCHEPHARM', 'J.B. Chemicals & Pharmaceuticals'], ['JKCEMENT', 'J.K. Cement'], ['JBMA', 'JBM Auto'],
  ['JKLAKSHMI', 'JK Lakshmi Cement'], ['JKPAPER', 'JK Paper'], ['JMFINANCIL', 'JM Financial'], ['JSWENERGY', 'JSW Energy'],
  ['JSWINFRA', 'JSW Infrastructure'], ['JSWSTEEL', 'JSW Steel'], ['JAIBALAJI', 'Jai Balaji Industries'], ['J&KBANK', 'Jammu & Kashmir Bank'],
  ['JINDALSAW', 'Jindal Saw'], ['JSL', 'Jindal Stainless'], ['JINDALSTEL', 'Jindal Steel & Power'], ['JIOFIN', 'Jio Financial Services'],
  ['JUBLFOOD', 'Jubilant Foodworks'], ['JUBLINGREA', 'Jubilant Ingrevia'], ['JUBLPHARMA', 'Jubilant Pharmova'], ['JWL', 'Jupiter Wagons'],
  ['JUSTDIAL', 'Justdial'], ['JYOTHYLAB', 'Jyothy Labs'], ['KPRMILL', 'K.P.R. Mill'], ['KEI', 'KEI Industries'],
  ['KNRCON', 'KNR Constructions'], ['KPITTECH', 'KPIT Technologies'], ['KRBL', 'KRBL'], ['KSB', 'KSB'],
  ['KAJARIACER', 'Kajaria Ceramics'], ['KPIL', 'Kalpataru Projects International'], ['KALYANKJIL', 'Kalyan Jewellers India'], ['KANSAINER', 'Kansai Nerolac Paints'],
  ['KARURVYSYA', 'Karur Vysya Bank'], ['KAYNES', 'Kaynes Technology India'], ['KEC', 'Kec International'], ['KFINTECH', 'Kfin Technologies'],
  ['KOTAKBANK', 'Kotak Mahindra Bank'], ['KIMS', 'Krishna Institute of Medical Sciences'], ['LTF', 'L&T Finance'], ['LTTS', 'L&T Technology Services'],
  ['LICHSGFIN', 'LIC Housing Finance'], ['LTIM', 'LTIMindtree'], ['LT', 'Larsen & Toubro'], ['LATENTVIEW', 'Latent View Analytics'],
  ['LAURUSLABS', 'Laurus Labs'], ['LXCHEM', 'Laxmi Organic Industries'], ['LEMONTREE', 'Lemon Tree Hotels'], ['LICI', 'Life Insurance Corporation of India'],
  ['LINDEINDIA', 'Linde India'], ['LLOYDSME', 'Lloyds Metals And Energy'], ['LUPIN', 'Lupin'], ['MMTC', 'MMTC'],
  ['MRF', 'MRF'], ['MTARTECH', 'MTAR Technologies'], ['LODHA', 'Macrotech Developers'], ['MGL', 'Mahanagar Gas'],
  ['MAHSEAMLES', 'Maharashtra Seamless'], ['M&MFIN', 'Mahindra & Mahindra Financial Services'], ['M&M', 'Mahindra & Mahindra'], ['MHRIL', 'Mahindra Holidays & Resorts India'],
  ['MAHLIFE', 'Mahindra Lifespace Developers'], ['MANAPPURAM', 'Manappuram Finance'], ['MRPL', 'Mangalore Refinery & Petrochemicals'], ['MANKIND', 'Mankind Pharma'],
  ['MARICO', 'Marico'], ['MARUTI', 'Maruti Suzuki India'], ['MASTEK', 'Mastek'], ['MFSL', 'Max Financial Services'],
  ['MAXHEALTH', 'Max Healthcare Institute'], ['MAZDOCK', 'Mazagoan Dock Shipbuilders'], ['MEDPLUS', 'Medplus Health Services'], ['METROBRAND', 'Metro Brands'],
  ['METROPOLIS', 'Metropolis Healthcare'], ['MINDACORP', 'Minda Corporation'], ['MSUMI', 'Motherson Sumi Wiring India'], ['MOTILALOFS', 'Motilal Oswal Financial Services'],
  ['MPHASIS', 'MphasiS'], ['MCX', 'Multi Commodity Exchange of India'], ['MUTHOOTFIN', 'Muthoot Finance'], ['NATCOPHARM', 'NATCO Pharma'],
  ['NBCC', 'NBCC (India)'], ['NCC', 'NCC'], ['NHPC', 'NHPC'], ['NLCINDIA', 'NLC India'],
  ['NMDC', 'NMDC'], ['NSLNISP', 'NMDC Steel'], ['NTPC', 'NTPC'], ['NH', 'Narayana Hrudayalaya'],
  ['NATIONALUM', 'National Aluminium Co.'], ['NAVINFLUOR', 'Navin Fluorine International'], ['NESTLEIND', 'Nestle India'], ['NETWORK18', 'Network18 Media & Investments'],
  ['NAM-INDIA', 'Nippon Life India Asset Management'], ['NUVAMA', 'Nuvama Wealth Management'], ['NUVOCO', 'Nuvoco Vistas Corporation'], ['OBEROIRLTY', 'Oberoi Realty'],
  ['ONGC', 'Oil & Natural Gas Corporation'], ['OIL', 'Oil India'], ['OLECTRA', 'Olectra Greentech'], ['PAYTM', 'One 97 Communications'],
  ['OFSS', 'Oracle Financial Services Software'], ['POLICYBZR', 'PB Fintech'], ['PCBL', 'PCBL'], ['PIIND', 'PI Industries'],
  ['PNBHOUSING', 'PNB Housing Finance'], ['PNCINFRA', 'PNC Infratech'], ['PVRINOX', 'PVR INOX'], ['PAGEIND', 'Page Industries'],
  ['PATANJALI', 'Patanjali Foods'], ['PERSISTENT', 'Persistent Systems'], ['PETRONET', 'Petronet LNG'], ['PHOENIXLTD', 'Phoenix Mills'],
  ['PIDILITIND', 'Pidilite Industries'], ['PEL', 'Piramal Enterprises'], ['PPLPHARMA', 'Piramal Pharma'], ['POLYMED', 'Poly Medicure'],
  ['POLYCAB', 'Polycab India'], ['POONAWALLA', 'Poonawalla Fincorp'], ['PFC', 'Power Finance Corporation'], ['POWERGRID', 'Power Grid Corporation of India'],
  ['PRAJIND', 'Praj Industries'], ['PRESTIGE', 'Prestige Estates Projects'], ['PRINCEPIPE', 'Prince Pipes and Fittings'], ['PRSMJOHNSN', 'Prism Johnson'],
  ['PGHH', 'Procter & Gamble Hygiene & Health Care'], ['PNB', 'Punjab National Bank'], ['QUESS', 'Quess Corp'], ['RRKABEL', 'R R Kabel'],
  ['RBLBANK', 'RBL Bank'], ['RECLTD', 'REC'], ['RHIM', 'RHI MAGNESITA INDIA LTD.'], ['RITES', 'RITES'],
  ['RADICO', 'Radico Khaitan'], ['RVNL', 'Rail Vikas Nigam'], ['RAILTEL', 'Railtel Corporation Of India'], ['RAINBOW', 'Rainbow Childrens Medicare'],
  ['RAJESHEXPO', 'Rajesh Exports'], ['RKFORGE', 'Ramkrishna Forgings'], ['RCF', 'Rashtriya Chemicals & Fertilizers'], ['RATNAMANI', 'Ratnamani Metals & Tubes'],
  ['RTNINDIA', 'RattanIndia Enterprises'], ['RAYMOND', 'Raymond'], ['REDINGTON', 'Redington'], ['RELIANCE', 'Reliance Industries'],
  ['RBA', 'Restaurant Brands Asia'], ['ROUTE', 'Route Mobile'], ['SBFC', 'SBFC Finance'], ['SBICARD', 'SBI Cards and Payment Services'],
  ['SBILIFE', 'SBI Life Insurance Company'], ['SJVN', 'SJVN'], ['SKFINDIA', 'SKF India'], ['SRF', 'SRF'],
  ['SAFARI', 'Safari Industries (India)'], ['SAMMAANCAP', 'Sammaan Capital'], ['MOTHERSON', 'Samvardhana Motherson International'], ['SANOFI', 'Sanofi India'],
  ['SAPPHIRE', 'Sapphire Foods India'], ['SAREGAMA', 'Saregama India'], ['SCHAEFFLER', 'Schaeffler India'], ['SCHNEIDER', 'Schneider Electric Infrastructure'],
  ['SHREECEM', 'Shree Cement'], ['RENUKA', 'Shree Renuka Sugars'], ['SHRIRAMFIN', 'Shriram Finance'], ['SHYAMMETL', 'Shyam Metalics and Energy'],
  ['SIEMENS', 'Siemens'], ['SIGNATURE', 'Signatureglobal (India)'], ['SOBHA', 'Sobha'], ['SOLARINDS', 'Solar Industries India'],
  ['SONACOMS', 'Sona BLW Precision Forgings'], ['SONATSOFTW', 'Sonata Software'], ['STARHEALTH', 'Star Health and Allied Insurance Company'], ['SBIN', 'State Bank of India'],
  ['SAIL', 'Steel Authority of India'], ['SWSOLAR', 'Sterling and Wilson Renewable Energy'], ['STLTECH', 'Sterlite Technologies'], ['SUMICHEM', 'Sumitomo Chemical India'],
  ['SPARC', 'Sun Pharma Advanced Research Company'], ['SUNPHARMA', 'Sun Pharmaceutical Industries'], ['SUNTV', 'Sun TV Network'], ['SUNDARMFIN', 'Sundaram Finance'],
  ['SUNDRMFAST', 'Sundram Fasteners'], ['SUNTECK', 'Sunteck Realty'], ['SUPREMEIND', 'Supreme Industries'], ['SUVENPHAR', 'Suven Pharmaceuticals'],
  ['SUZLON', 'Suzlon Energy'], ['SWANENERGY', 'Swan Energy'], ['SYNGENE', 'Syngene International'], ['SYRMA', 'Syrma SGS Technology'],
  ['TBOTEK', 'TBO Tek'], ['TVSMOTOR', 'TVS Motor Company'], ['TVSSCS', 'TVS Supply Chain Solutions'], ['TMB', 'Tamilnad Mercantile Bank'],
  ['TANLA', 'Tanla Platforms'], ['TATACHEM', 'Tata Chemicals'], ['TATACOMM', 'Tata Communications'], ['TCS', 'Tata Consultancy Services'],
  ['TATACONSUM', 'Tata Consumer Products'], ['TATAELXSI', 'Tata Elxsi'], ['TATAINVEST', 'Tata Investment Corporation'], ['TATAMOTORS', 'Tata Motors'],
  ['TATAPOWER', 'Tata Power Co.'], ['TATASTEEL', 'Tata Steel'], ['TATATECH', 'Tata Technologies'], ['TTML', 'Tata Teleservices (Maharashtra)'],
  ['TECHM', 'Tech Mahindra'], ['TEJASNET', 'Tejas Networks'], ['NIACL', 'The New India Assurance Company'], ['RAMCOCEM', 'The Ramco Cements'],
  ['THERMAX', 'Thermax'], ['TIMKEN', 'Timken India'], ['TITAGARH', 'Titagarh Rail Systems'], ['TITAN', 'Titan Company'],
  ['TORNTPHARM', 'Torrent Pharmaceuticals'], ['TORNTPOWER', 'Torrent Power'], ['TRENT', 'Trent'], ['TRIDENT', 'Trident'],
  ['TRIVENI', 'Triveni Engineering & Industries'], ['TRITURBINE', 'Triveni Turbine'], ['TIINDIA', 'Tube Investments of India'], ['UCOBANK', 'UCO Bank'],
  ['UNOMINDA', 'UNO Minda'], ['UPL', 'UPL'], ['UTIAMC', 'UTI Asset Management Company'], ['UJJIVANSFB', 'Ujjivan Small Finance Bank'],
  ['ULTRACEMCO', 'UltraTech Cement'], ['UNIONBANK', 'Union Bank of India'], ['UBL', 'United Breweries'], ['UNITDSPR', 'United Spirits'],
  ['USHAMART', 'Usha Martin'], ['VGUARD', 'V-Guard Industries'], ['VIPIND', 'V.I.P. Industries'], ['VAIBHAVGBL', 'Vaibhav Global'],
  ['VTL', 'Vardhman Textiles'], ['VARROC', 'Varroc Engineering'], ['VBL', 'Varun Beverages'], ['MANYAVAR', 'Vedant Fashions'],
  ['VEDL', 'Vedanta'], ['VIJAYA', 'Vijaya Diagnostic Centre'], ['IDEA', 'Vodafone Idea'], ['VOLTAS', 'Voltas'],
  ['WELCORP', 'Welspun Corp'], ['WELSPUNLIV', 'Welspun Living'], ['WESTLIFE', 'Westlife Foodworld'], ['WHIRLPOOL', 'Whirlpool of India'],
  ['WIPRO', 'Wipro'], ['YESBANK', 'Yes Bank'], ['ZFCVINDIA', 'ZF Commercial Vehicle Control Systems India'], ['ZEEL', 'Zee Entertainment Enterprises'],
  ['ZENSARTECH', 'Zensar Technologies'], ['ETERNAL', 'Eternal'], ['ZYDUSLIFE', 'Zydus Lifesciences'], ['ECLERX', 'eClerx Services'],
  // Notable large listings from 2024-2025 that postdate the Nov 2024 Nifty 500 snapshot above.
  ['ATHERENERG', 'Ather Energy'], ['HYUNDAI', 'Hyundai Motor India'], ['NTPCGREEN', 'NTPC Green Energy'],
  ['VMM', 'Vishal Mega Mart'], ['BAJAJHFL', 'Bajaj Housing Finance'], ['OLAELEC', 'Ola Electric Mobility'],
  ['WAAREEENER', 'Waaree Energies'], ['PREMIERENE', 'Premier Energies'], ['BHARTIHEXA', 'Bharti Hexacom'],
  ['MOBIKWIK', 'One Mobikwik Systems'],
];


// Major NSE broad-market and sectoral indices, for weekly benchmark comparison.
const NSE_INDICES = [
  'NIFTY 50', 'NIFTY BANK', 'NIFTY NEXT 50', 'NIFTY MIDCAP 100', 'NIFTY SMALLCAP 100',
  'NIFTY IT', 'NIFTY METAL', 'NIFTY AUTO', 'NIFTY PHARMA', 'NIFTY FMCG', 'NIFTY ENERGY',
  'NIFTY REALTY', 'NIFTY MEDIA', 'NIFTY PSU BANK', 'NIFTY PVT BANK', 'NIFTY FIN SERVICE',
  'NIFTY INFRA', 'NIFTY HEALTHCARE', 'NIFTY CONSUMER DURABLES', 'NIFTY OIL & GAS',
];

function PromptPanel({ text, copied, onCopy, onClose }) {
  return (
    <div className="mt-3 p-3 rounded-sm" style={{ background: C.panelAlt, border: `1px solid ${C.gold}55` }}>
      <div className="flex items-center justify-between mb-2">
        <span style={{ fontFamily: mono, fontSize: 10.5, letterSpacing: 1, color: C.gold }}>
          {copied ? 'COPIED — PASTE INTO CHAT' : 'COPY THIS INTO CHAT'}
        </span>
        <button onClick={onClose} style={{ color: C.faint, fontFamily: sans, fontSize: 11 }}>close</button>
      </div>
      <textarea
        readOnly
        value={text}
        onFocus={e => e.target.select()}
        rows={3}
        style={{
          width: '100%', background: C.bg, color: C.text, fontFamily: sans, fontSize: 12,
          border: `1px solid ${C.hairline}`, borderRadius: 4, padding: 8, resize: 'vertical', outline: 'none',
        }}
      />
      <button
        onClick={onCopy}
        className="mt-2 px-3 py-1.5"
        style={{ background: C.gold, color: C.bg, fontFamily: sans, fontWeight: 600, fontSize: 12, borderRadius: 4 }}
      >
        {copied ? 'Copied ✓' : 'Copy'}
      </button>
      <div style={{ fontFamily: sans, fontSize: 11, color: C.faint, marginTop: 6, lineHeight: 1.4 }}>
        Paste this into your chat with Claude, then copy the prices Claude replies with into the fields below.
      </div>
    </div>
  );
}

function StockNameInput({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState(value || '');
  useEffect(() => { setQ(value || ''); }, [value]);

  const matches = useMemo(() => {
    const query = q.trim().toLowerCase();
    if (!query) return [];
    return NSE_STOCKS
      .filter(([sym, name]) => sym.toLowerCase().includes(query) || name.toLowerCase().includes(query))
      .slice(0, 8);
  }, [q]);

  function pick(sym) {
    setQ(sym);
    onChange(sym);
    setOpen(false);
  }

  return (
    <div style={{ position: 'relative' }}>
      <input
        value={q}
        placeholder="Search name or symbol…"
        onChange={e => { setQ(e.target.value); onChange(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 130)}
        onKeyDown={e => { if (e.key === 'Enter' && matches.length) { e.preventDefault(); pick(matches[0][0]); } if (e.key === 'Escape') setOpen(false); }}
        style={{
          background: 'transparent', color: C.text, fontFamily: sans,
          border: 'none', borderBottom: `1px solid ${C.hairline}`, padding: '4px 2px',
          width: '100%', fontSize: 13, outline: 'none',
        }}
        onFocusCapture={e => e.target.style.borderBottomColor = C.gold}
      />
      {open && matches.length > 0 && (
        <div
          className="custom-scroll"
          style={{
            position: 'absolute', zIndex: 30, top: '100%', left: 0, marginTop: 4,
            minWidth: 260, maxHeight: 230, overflowY: 'auto',
            background: C.panelAlt, border: `1px solid ${C.hairline2}`, borderRadius: 4,
            boxShadow: '0 8px 20px rgba(0,0,0,0.4)',
          }}
        >
          {matches.map(([sym, name]) => (
            <div
              key={sym}
              onMouseDown={() => pick(sym)}
              className="ledger-suggest-row"
              style={{ padding: '7px 12px', cursor: 'pointer', display: 'flex', alignItems: 'baseline', gap: 8, whiteSpace: 'nowrap' }}
            >
              <span style={{ fontFamily: mono, fontSize: 12.5, fontWeight: 600, color: C.gold }}>{sym}</span>
              <span style={{ fontFamily: sans, fontSize: 11.5, color: C.muted, overflow: 'hidden', textOverflow: 'ellipsis' }}>{name}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function StampBadge({ topLabel, value, live, rotate }) {
  const positive = value > 0;
  const color = changeColor(value);
  return (
    <div
      className="flex flex-col items-center justify-center shrink-0"
      style={{
        width: 92, height: 92, borderRadius: '50%',
        border: `2px dashed ${live ? C.hairline2 : color}`,
        opacity: live ? 0.55 : 1,
        transform: `rotate(${rotate}deg)`,
        background: live ? 'transparent' : (value === 0 ? 'transparent' : (positive ? C.posSoft : C.negSoft)),
      }}
    >
      <span style={{ fontFamily: mono, fontSize: 9, letterSpacing: 1.5, color: C.muted, marginBottom: 2 }}>
        {topLabel}
      </span>
      <span style={{ fontFamily: mono, fontWeight: 700, fontSize: 15, color }}>
        {fmtPct(value)}
      </span>
      <span style={{ fontFamily: mono, fontSize: 8, letterSpacing: 1, color: C.faint, marginTop: 2 }}>
        {live ? 'IN PROGRESS' : 'CLOSED'}
      </span>
    </div>
  );
}

function FieldInput({ value, onChange, type = 'text', align = 'left', placeholder }) {
  return (
    <input
      type={type}
      value={value}
      placeholder={placeholder}
      onChange={e => onChange(e.target.value)}
      style={{
        background: 'transparent', color: C.text, fontFamily: type === 'number' ? mono : sans,
        border: 'none', borderBottom: `1px solid ${C.hairline}`, padding: '4px 2px',
        width: '100%', textAlign: align, fontSize: 13, outline: 'none',
      }}
      onFocus={e => e.target.style.borderBottomColor = C.gold}
      onBlur={e => e.target.style.borderBottomColor = C.hairline}
    />
  );
}

export default function StockLedger() {
  const [stocks, setStocks] = useState([]);
  const [prices, setPrices] = useState({});
  const [indexLevels, setIndexLevels] = useState({});
  const [syncUrl, setSyncUrl] = useState('');
  const [syncStatus, setSyncStatus] = useState('idle'); // idle | syncing | ok | error
  const [lastSync, setLastSync] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [promptDraft, setPromptDraft] = useState(null);
  const [promptSource, setPromptSource] = useState(null);
  const [copied, setCopied] = useState(false);
  const [entryDate, setEntryDate] = useState(today());
  const [entryCloses, setEntryCloses] = useState({});
  const [saveError, setSaveError] = useState(false);
  const loadedRef = useRef(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await window.storage.get('ledger-data', false);
        if (res && res.value) {
          const parsed = JSON.parse(res.value);
          setStocks(parsed.stocks || []);
          setPrices(parsed.prices || {});
          setIndexLevels(parsed.indexLevels || {});
          setSyncUrl(parsed.syncUrl || '');
        }
      } catch (e) {
        // no existing data yet
      } finally {
        setLoaded(true);
        loadedRef.current = true;
      }
    })();
  }, []);

  useEffect(() => {
    if (!loadedRef.current) return;
    (async () => {
      try {
        const r = await window.storage.set('ledger-data', JSON.stringify({ stocks, prices, indexLevels, syncUrl }), false);
        setSaveError(!r);
      } catch (e) {
        setSaveError(true);
      }
    })();
  }, [stocks, prices, indexLevels, syncUrl]);

  useEffect(() => {
    if (loaded && syncUrl) {
      syncFromBackend(syncUrl);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded]);

  function addStock() {
    setStocks(s => [...s, { id: uid(), name: '', entryPrice: 0, quantity: 0, entryDate: today() }]);
  }
  function updateStock(id, field, value) {
    setStocks(s => s.map(st => st.id === id ? { ...st, [field]: field === 'entryPrice' || field === 'quantity' ? num(value) : value } : st));
  }
  function removeStock(id) {
    setStocks(s => s.filter(st => st.id !== id));
    setPrices(p => { const cp = { ...p }; delete cp[id]; return cp; });
  }
  function recordDay() {
    setPrices(p => {
      const cp = { ...p };
      stocks.forEach(s => {
        const v = entryCloses[s.id];
        if (v !== undefined && v !== '') {
          cp[s.id] = { ...(cp[s.id] || {}), [entryDate]: num(v) };
        }
      });
      return cp;
    });
    setEntryCloses({});
  }
  function updateClose(stockId, date, value) {
    setPrices(p => ({ ...p, [stockId]: { ...(p[stockId] || {}), [date]: num(value) } }));
  }

  async function syncFromBackend(urlOverride) {
    const base = (urlOverride !== undefined ? urlOverride : syncUrl).trim().replace(/\/+$/, '');
    if (!base) return;
    setSyncStatus('syncing');
    try {
      const bust = `t=${Date.now()}`;
      const [pRes, iRes] = await Promise.all([
        fetch(`${base}/prices.json?${bust}`, { cache: 'no-store' }),
        fetch(`${base}/indices.json?${bust}`, { cache: 'no-store' }),
      ]);
      const priceHistory = pRes.ok ? await pRes.json() : {};
      const indexHistory = iRes.ok ? await iRes.json() : {};

      setPrices(prev => {
        const next = { ...prev };
        stocks.forEach(s => {
          const sym = (s.name || '').trim().toUpperCase();
          if (!sym) return;
          const dateMap = { ...(next[s.id] || {}) };
          Object.entries(priceHistory).forEach(([date, syms]) => {
            if (syms && syms[sym] !== undefined && dateMap[date] === undefined) {
              dateMap[date] = syms[sym];
            }
          });
          next[s.id] = dateMap;
        });
        return next;
      });

      setIndexLevels(prev => {
        const next = { ...prev };
        Object.entries(indexHistory).forEach(([date, idxs]) => {
          next[date] = { ...(next[date] || {}), ...idxs };
        });
        return next;
      });

      setSyncStatus('ok');
      setLastSync(new Date().toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }));
    } catch (e) {
      setSyncStatus('error');
    }
  }

  function copyPrompt(text, source) {
    setPromptDraft(text);
    if (source) setPromptSource(source);
    setCopied(false);
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(() => setCopied(true)).catch(() => {});
    }
  }

  function exportToExcel() {
    const wb = XLSX.utils.book_new();

    const holdingsRows = stocks.map(s => {
      const tl = timelines[s.id] || [];
      const lastClose = tl.length ? tl[tl.length - 1].close : null;
      const curVal = (lastClose !== null ? lastClose : s.entryPrice) * s.quantity;
      const ret = s.entryPrice ? ((((lastClose !== null ? lastClose : s.entryPrice)) - s.entryPrice) / s.entryPrice) * 100 : 0;
      return {
        Stock: s.name, 'Entry Price': s.entryPrice, Quantity: s.quantity, 'Entry Date': s.entryDate,
        'Last Close': lastClose, 'Current Value': Number(curVal.toFixed(2)), 'Return %': Number(ret.toFixed(2)),
      };
    });
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(holdingsRows), 'Holdings');

    const dailyRows = [];
    stocks.forEach(s => {
      (timelines[s.id] || []).forEach(pt => {
        const ret = (dailyRetByStock[s.id] || {})[pt.date];
        dailyRows.push({ Date: pt.date, Stock: s.name, Close: pt.close, 'Daily Return %': ret !== undefined ? Number(ret.toFixed(2)) : '' });
      });
    });
    dailyRows.sort((a, b) => (a.Date < b.Date ? -1 : a.Date > b.Date ? 1 : 0));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(dailyRows), 'Daily Prices');

    const weeklyRows = weeklyReturns.map(w => {
      const row = { Week: w.label, 'Portfolio Value': Number(w.value.toFixed(2)), 'Portfolio Return %': Number(w.return.toFixed(2)) };
      NSE_INDICES.forEach(ix => {
        const iw = indexWeeklyReturns.find(r => r.key === w.key);
        row[ix + ' %'] = iw && iw.returns[ix] !== undefined ? Number(iw.returns[ix].toFixed(2)) : '';
      });
      return row;
    });
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(weeklyRows), 'Weekly Returns');

    const monthlyRows = monthlyReturns.map(m => ({ Month: m.label, 'Portfolio Value': Number(m.value.toFixed(2)), 'Portfolio Return %': Number(m.return.toFixed(2)) }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(monthlyRows), 'Monthly Returns');

    XLSX.writeFile(wb, `stock-ledger-${today()}.xlsx`);
  }
  function removeCell(stockId, date) {
    setPrices(p => {
      const inner = { ...(p[stockId] || {}) };
      delete inner[date];
      return { ...p, [stockId]: inner };
    });
  }

  const timelines = useMemo(() => {
    const t = {};
    stocks.forEach(s => { t[s.id] = buildTimeline(s.id, prices); });
    return t;
  }, [stocks, prices]);

  const dailyRetByStock = useMemo(() => {
    const t = {};
    stocks.forEach(s => { t[s.id] = dailyReturnMap(timelines[s.id], s.entryPrice); });
    return t;
  }, [stocks, timelines]);

  const allDates = useMemo(() => {
    const set = new Set();
    stocks.forEach(s => Object.keys(prices[s.id] || {}).forEach(d => set.add(d)));
    return [...set].sort().reverse();
  }, [stocks, prices]);

  const investedTotal = useMemo(() => stocks.reduce((a, s) => a + s.entryPrice * s.quantity, 0), [stocks]);

  const portfolioTimeline = useMemo(() => buildPortfolioTimeline(stocks, prices), [stocks, prices]);

  const latestTotal = portfolioTimeline.length ? portfolioTimeline[portfolioTimeline.length - 1].value : investedTotal;
  const overallReturn = investedTotal ? ((latestTotal - investedTotal) / investedTotal) * 100 : 0;

  const weeklyReturns = useMemo(
    () => periodReturns(portfolioTimeline, investedTotal, isoWeekKey, weekLabel),
    [portfolioTimeline, investedTotal]
  );
  const monthlyReturns = useMemo(
    () => periodReturns(portfolioTimeline, investedTotal, monthKey, monthLabel),
    [portfolioTimeline, investedTotal]
  );

  const currentWeekKey = isoWeekKey(today());
  const currentMonthKey = monthKey(today());

  const chartData = portfolioTimeline.map(pt => ({ date: dateLabel(pt.date), value: Math.round(pt.value * 100) / 100 }));

  const weekKeys = useMemo(
    () => [...new Set(allDates.map(isoWeekKey))].sort().reverse(),
    [allDates]
  );

  const portfolioDaily = useMemo(() => {
    const valueMap = {}, retMap = {};
    let prev = investedTotal;
    portfolioTimeline.forEach(pt => {
      retMap[pt.date] = prev ? ((pt.value - prev) / prev) * 100 : 0;
      valueMap[pt.date] = pt.value;
      prev = pt.value;
    });
    return { valueMap, retMap };
  }, [portfolioTimeline, investedTotal]);

  const indexWeeklyReturns = useMemo(() => {
    const dates = Object.keys(indexLevels).sort();
    const byWeek = new Map();
    dates.forEach(d => {
      const wk = isoWeekKey(d);
      byWeek.set(wk, { ...(byWeek.get(wk) || {}), ...indexLevels[d] });
    });
    const wks = [...byWeek.keys()].sort();
    let prevLevels = {};
    const rows = wks.map(wk => {
      const levels = byWeek.get(wk);
      const returns = {};
      NSE_INDICES.forEach(ix => {
        const cur = levels[ix], prev = prevLevels[ix];
        returns[ix] = (cur !== undefined && prev !== undefined) ? ((cur - prev) / prev) * 100 : undefined;
      });
      prevLevels = { ...prevLevels, ...levels };
      return { key: wk, label: weekLabel(wk), returns };
    });
    return rows.reverse();
  }, [indexLevels]);

  if (!loaded) {
    return (
      <div className="flex items-center justify-center min-h-[400px]" style={{ background: C.bg, color: C.muted, fontFamily: sans }}>
        <Loader2 className="animate-spin mr-2" size={18} /> Opening the ledger…
      </div>
    );
  }

  return (
    <div style={{ background: C.bg, color: C.text, fontFamily: sans, minHeight: '100%' }} className="w-full">
      <style>{FONTS}{`
        ::-webkit-scrollbar { height: 8px; width: 8px; }
        ::-webkit-scrollbar-thumb { background: ${C.hairline2}; border-radius: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        input::-webkit-outer-spin-button, input::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
        input[type=number] { -moz-appearance: textfield; }
        .ledger-suggest-row:hover { background: ${C.goldSoft}; }
      `}</style>

      <div className="max-w-6xl mx-auto px-5 sm:px-8 py-8 sm:py-10">

        {/* Masthead */}
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 pb-6 mb-8" style={{ borderBottom: `1px solid ${C.hairline}` }}>
          <div>
            <div style={{ fontFamily: mono, fontSize: 11, letterSpacing: 3, color: C.gold }}>PORTFOLIO LEDGER</div>
            <h1 style={{ fontFamily: serif, fontWeight: 600, fontSize: 34, marginTop: 4, lineHeight: 1.1 }}>
              The Closing Ledger
            </h1>
            <div style={{ fontFamily: sans, fontSize: 13, color: C.muted, marginTop: 6, maxWidth: 480 }}>
              Ask Claude for today's NSE close, drop it in the Day Book. Weekly and monthly statements are struck automatically at period end.
            </div>
          </div>
          <div className="text-left sm:text-right">
            <div style={{ fontFamily: mono, fontSize: 11, letterSpacing: 1.5, color: C.muted }}>PORTFOLIO VALUE</div>
            <div style={{ fontFamily: mono, fontWeight: 700, fontSize: 30, color: C.text }}>₹{fmtMoney(latestTotal)}</div>
            <div className="flex sm:justify-end items-center gap-1.5 mt-1">
              {overallReturn > 0 ? <TrendingUp size={14} color={C.pos} /> : overallReturn < 0 ? <TrendingDown size={14} color={C.neg} /> : <Minus size={14} color={C.muted} />}
              <span style={{ fontFamily: mono, fontSize: 13, fontWeight: 600, color: changeColor(overallReturn) }}>
                {fmtPct(overallReturn)} since entry
              </span>
            </div>
            {stocks.length > 0 && (
              <button
                onClick={exportToExcel}
                className="flex items-center gap-1.5 px-3 py-1.5 mt-3 ml-auto"
                style={{ background: C.goldSoft, color: C.gold, fontFamily: sans, fontSize: 12, fontWeight: 600, borderRadius: 4, border: `1px solid ${C.gold}55` }}
              >
                <Download size={13} /> Export to Excel
              </button>
            )}
          </div>
        </div>

        {/* Holdings */}
        <section className="mb-10">
          <div className="flex items-center justify-between mb-3">
            <h2 style={{ fontFamily: serif, fontSize: 20, fontWeight: 600 }}>Holdings</h2>
            <button onClick={addStock} className="flex items-center gap-1.5 px-3 py-1.5"
              style={{ background: C.goldSoft, color: C.gold, fontFamily: sans, fontSize: 12.5, fontWeight: 600, borderRadius: 4, border: `1px solid ${C.gold}55` }}>
              <Plus size={14} /> Add holding
            </button>
          </div>

          <div className="overflow-x-auto rounded-sm" style={{ border: `1px solid ${C.hairline}`, background: C.panel }}>
            <table className="w-full" style={{ borderCollapse: 'collapse', minWidth: 760 }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${C.hairline}` }}>
                  {['Stock', 'Entry Price', 'Quantity', 'Entry Date', 'Last Close', 'Current Value', 'Return', ''].map((h, i) => (
                    <th key={i} style={{ fontFamily: mono, fontSize: 10.5, letterSpacing: 1, color: C.muted, textAlign: i === 0 ? 'left' : 'right', padding: '10px 14px', fontWeight: 500 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {stocks.length === 0 && (
                  <tr><td colSpan={8} style={{ padding: '28px 14px', textAlign: 'center', color: C.muted, fontSize: 13, fontFamily: sans }}>
                    No holdings yet. Add one to start marking daily closes.
                  </td></tr>
                )}
                {stocks.map((s, idx) => {
                  const tl = timelines[s.id];
                  const lastClose = tl.length ? tl[tl.length - 1].close : null;
                  const curVal = (lastClose !== null ? lastClose : s.entryPrice) * s.quantity;
                  const ret = s.entryPrice ? ((((lastClose !== null ? lastClose : s.entryPrice)) - s.entryPrice) / s.entryPrice) * 100 : 0;
                  return (
                    <tr key={s.id} style={{ borderBottom: idx === stocks.length - 1 ? 'none' : `1px solid ${C.hairline}` }}>
                      <td style={{ padding: '8px 14px', minWidth: 180 }}>
                        <StockNameInput value={s.name} onChange={v => updateStock(s.id, 'name', v)} />
                      </td>
                      <td style={{ padding: '8px 14px', width: 120 }}>
                        <FieldInput type="number" align="right" value={s.entryPrice || ''} onChange={v => updateStock(s.id, 'entryPrice', v)} placeholder="0.00" />
                      </td>
                      <td style={{ padding: '8px 14px', width: 100 }}>
                        <FieldInput type="number" align="right" value={s.quantity || ''} onChange={v => updateStock(s.id, 'quantity', v)} placeholder="0" />
                      </td>
                      <td style={{ padding: '8px 14px', width: 140 }}>
                        <FieldInput type="date" align="right" value={s.entryDate} onChange={v => updateStock(s.id, 'entryDate', v)} />
                      </td>
                      <td style={{ padding: '8px 14px', textAlign: 'right', fontFamily: mono, fontSize: 13, color: C.muted }}>
                        {lastClose !== null ? fmtMoney(lastClose) : '—'}
                      </td>
                      <td style={{ padding: '8px 14px', textAlign: 'right', fontFamily: mono, fontSize: 13 }}>
                        ₹{fmtMoney(curVal)}
                      </td>
                      <td style={{ padding: '8px 14px', textAlign: 'right', fontFamily: mono, fontSize: 13, fontWeight: 600, color: changeColor(ret) }}>
                        {fmtPct(ret)}
                      </td>
                      <td style={{ padding: '8px 10px', textAlign: 'right' }}>
                        <button onClick={() => removeStock(s.id)} style={{ color: C.faint }} aria-label="Remove holding">
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              {stocks.length > 0 && (
                <tfoot>
                  <tr style={{ borderTop: `1px solid ${C.hairline}` }}>
                    <td colSpan={5} style={{ padding: '10px 14px', fontFamily: mono, fontSize: 11, color: C.muted, letterSpacing: 1 }}>INVESTED ₹{fmtMoney(investedTotal)}</td>
                    <td style={{ padding: '10px 14px', textAlign: 'right', fontFamily: mono, fontSize: 13, fontWeight: 700 }}>₹{fmtMoney(latestTotal)}</td>
                    <td style={{ padding: '10px 14px', textAlign: 'right', fontFamily: mono, fontSize: 13, fontWeight: 700, color: changeColor(overallReturn) }}>{fmtPct(overallReturn)}</td>
                    <td />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </section>

        {stocks.length > 0 && (
          <>
            {/* Day Book */}
            <section className="mb-10">
              <h2 style={{ fontFamily: serif, fontSize: 20, fontWeight: 600 }} className="mb-3 flex items-center gap-2">
                <BookOpen size={18} color={C.gold} /> Day Book
              </h2>

              <div className="p-4 rounded-sm mb-5" style={{ background: C.panel, border: `1px solid ${C.gold}55` }}>
                <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
                  <div style={{ fontFamily: mono, fontSize: 10.5, letterSpacing: 1, color: C.gold }}>AUTOMATIC SYNC</div>
                  <span style={{ fontFamily: mono, fontSize: 10.5, color: syncStatus === 'ok' ? C.pos : syncStatus === 'error' ? C.neg : C.muted }}>
                    {syncStatus === 'syncing' && 'syncing…'}
                    {syncStatus === 'ok' && `synced ${lastSync || ''}`}
                    {syncStatus === 'error' && 'sync failed — check the URL'}
                    {syncStatus === 'idle' && 'not set up yet'}
                  </span>
                </div>
                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    value={syncUrl}
                    onChange={e => setSyncUrl(e.target.value)}
                    placeholder="https://raw.githubusercontent.com/<user>/<repo>/main/data"
                    style={{
                      flex: 1, background: C.bg, color: C.text, fontFamily: mono, fontSize: 12,
                      border: `1px solid ${C.hairline}`, borderRadius: 4, padding: '7px 10px', outline: 'none',
                    }}
                  />
                  <button
                    onClick={() => syncFromBackend()}
                    className="px-4 py-2 flex items-center justify-center gap-1.5 shrink-0"
                    style={{ background: C.gold, color: C.bg, fontFamily: sans, fontWeight: 600, fontSize: 12.5, borderRadius: 4 }}
                  >
                    <RefreshCw size={13} /> Sync now
                  </button>
                </div>
                <div style={{ fontFamily: sans, fontSize: 11, color: C.faint, marginTop: 8, lineHeight: 1.4 }}>
                  Points at a small free backend that fetches NSE closes for you every trading day — set it up once and this
                  runs itself from then on, no daily copy-paste. Setup instructions are in the backend package I gave you.
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-[300px_1fr] gap-5">
                {/* entry form */}
                <div className="p-4 rounded-sm" style={{ background: C.panel, border: `1px solid ${C.hairline}` }}>
                  <div style={{ fontFamily: mono, fontSize: 10.5, letterSpacing: 1, color: C.muted, marginBottom: 8 }}>MANUAL FALLBACK</div>
                  <FieldInput type="date" value={entryDate} onChange={setEntryDate} />
                  <button
                    onClick={() => {
                      const names = stocks.map(s => s.name).filter(Boolean);
                      if (!names.length) return;
                      copyPrompt(
                        `Look up today's NSE closing price (or latest traded price if the market is still open) for each of these stocks: ${names.join(', ')}. Give me a short list in the format "NAME: price" so I can copy it into my ledger for ${entryDate}.`,
                        'daybook'
                      );
                    }}
                    className="w-full mt-3 py-2 flex items-center justify-center gap-1.5"
                    style={{ background: 'transparent', color: C.gold, fontFamily: sans, fontWeight: 600, fontSize: 12.5, borderRadius: 4, border: `1px solid ${C.gold}55` }}
                  >
                    <RefreshCw size={13} /> Ask Claude for today's close
                  </button>
                  <button
                    onClick={() => {
                      const names = stocks.map(s => s.name).filter(Boolean);
                      if (!names.length) return;
                      const days = weekdayDates(currentWeekKey).filter(d => d.date <= today());
                      const dateList = days.map(d => `${d.label} (${d.date})`).join(', ');
                      copyPrompt(
                        `Look up NSE closing prices for each of these stocks: ${names.join(', ')} — for every trading day so far this week: ${dateList}. Skip any day the market was shut. Reply one line per stock, formatted like "NAME: Mon=price, Tue=price, Wed=price" (only the days that have actually closed), so I can backfill my ledger for the week.`,
                        'daybook'
                      );
                    }}
                    className="w-full mt-2 py-2 flex items-center justify-center gap-1.5"
                    style={{ background: C.goldSoft, color: C.gold, fontFamily: sans, fontWeight: 600, fontSize: 12.5, borderRadius: 4, border: `1px solid ${C.gold}55` }}
                  >
                    <RefreshCw size={13} /> Backfill this week (Mon → today)
                  </button>
                  {promptDraft && promptSource === 'daybook' && (
                    <PromptPanel
                      text={promptDraft}
                      copied={copied}
                      onCopy={() => copyPrompt(promptDraft, 'daybook')}
                      onClose={() => setPromptDraft(null)}
                    />
                  )}
                  <div style={{ fontFamily: sans, fontSize: 11, color: C.faint, marginTop: 6, lineHeight: 1.4 }}>
                    NSE doesn't allow this page to pull prices directly (no public, cross-origin feed) — these give you a ready-made prompt to paste into your chat with Claude, which you then drop into the fields below.
                  </div>
                  <div className="mt-4 flex flex-col gap-3">
                    {stocks.map(s => (
                      <div key={s.id} className="flex items-center justify-between gap-3">
                        <span style={{ fontFamily: sans, fontSize: 13, color: C.muted, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {s.name || 'Unnamed'}
                        </span>
                        <div style={{ width: 100 }}>
                          <FieldInput type="number" align="right" placeholder="close" value={entryCloses[s.id] ?? ''} onChange={v => setEntryCloses(c => ({ ...c, [s.id]: v }))} />
                        </div>
                      </div>
                    ))}
                  </div>
                  <button onClick={recordDay} className="w-full mt-5 py-2"
                    style={{ background: C.gold, color: C.bg, fontFamily: sans, fontWeight: 600, fontSize: 13, borderRadius: 4 }}>
                    Record closes
                  </button>
                </div>

                {/* weekly Mon-Fri grid */}
                <div className="flex flex-col gap-4 overflow-y-auto pr-1" style={{ maxHeight: 560 }}>
                  {weekKeys.length === 0 && (
                    <div className="rounded-sm p-6 text-center" style={{ border: `1px solid ${C.hairline}`, background: C.panel, color: C.muted, fontSize: 13 }}>
                      No closes recorded yet.
                    </div>
                  )}
                  {weekKeys.map(wk => {
                    const days = weekdayDates(wk);
                    const wr = weeklyReturns.find(w => w.key === wk);
                    return (
                      <div key={wk} className="overflow-x-auto rounded-sm" style={{ border: `1px solid ${C.hairline}`, background: C.panel }}>
                        <div className="flex items-center justify-between px-4 pt-3 pb-1">
                          <span style={{ fontFamily: mono, fontSize: 11, letterSpacing: 1, color: C.gold }}>{weekLabel(wk)}</span>
                          {wr && (
                            <span style={{ fontFamily: mono, fontSize: 11.5, fontWeight: 600, color: changeColor(wr.return) }}>
                              week {fmtPct(wr.return)}
                            </span>
                          )}
                        </div>
                        <table className="w-full" style={{ borderCollapse: 'collapse', minWidth: 480 }}>
                          <thead>
                            <tr style={{ borderBottom: `1px solid ${C.hairline}` }}>
                              <th style={{ fontFamily: mono, fontSize: 10.5, color: C.muted, textAlign: 'left', padding: '8px 14px' }}>STOCK</th>
                              {days.map(d => (
                                <th key={d.date} style={{ fontFamily: mono, fontSize: 10.5, color: d.date > today() ? C.faint : C.muted, textAlign: 'right', padding: '8px 14px', whiteSpace: 'nowrap' }}>
                                  {d.label} <span style={{ color: C.faint }}>{d.short}</span>
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {stocks.map((s, si) => (
                              <tr key={s.id} style={{ borderBottom: si === stocks.length - 1 ? 'none' : `1px solid ${C.hairline}` }}>
                                <td style={{ padding: '6px 14px', fontFamily: sans, fontSize: 12.5, color: C.muted, whiteSpace: 'nowrap', maxWidth: 130, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                  {s.name || 'Unnamed'}
                                </td>
                                {days.map(d => {
                                  const close = (prices[s.id] || {})[d.date];
                                  const ret = dailyRetByStock[s.id] ? dailyRetByStock[s.id][d.date] : undefined;
                                  return (
                                    <td key={d.date} style={{ padding: '4px 14px', textAlign: 'right' }}>
                                      <input
                                        type="number"
                                        value={close ?? ''}
                                        placeholder="—"
                                        onChange={e => e.target.value === '' ? removeCell(s.id, d.date) : updateClose(s.id, d.date, e.target.value)}
                                        style={{ background: 'transparent', border: 'none', color: C.text, fontFamily: mono, fontSize: 12.5, textAlign: 'right', width: 68, outline: 'none' }}
                                      />
                                      {ret !== undefined && (
                                        <div style={{ fontFamily: mono, fontSize: 9.5, color: changeColor(ret) }}>{fmtPct(ret)}</div>
                                      )}
                                    </td>
                                  );
                                })}
                              </tr>
                            ))}
                            <tr style={{ borderTop: `1px solid ${C.hairline}`, background: C.panelAlt }}>
                              <td style={{ padding: '7px 14px', fontFamily: sans, fontSize: 12.5, fontWeight: 600 }}>Portfolio</td>
                              {days.map(d => {
                                const val = portfolioDaily.valueMap[d.date];
                                const ret = portfolioDaily.retMap[d.date];
                                return (
                                  <td key={d.date} style={{ padding: '7px 14px', textAlign: 'right' }}>
                                    <div style={{ fontFamily: mono, fontSize: 12, fontWeight: 600 }}>{val !== undefined ? `₹${fmtMoney(val)}` : '—'}</div>
                                    {ret !== undefined && (
                                      <div style={{ fontFamily: mono, fontSize: 9.5, color: changeColor(ret) }}>{fmtPct(ret)}</div>
                                    )}
                                  </td>
                                );
                              })}
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    );
                  })}
                </div>
              </div>
            </section>

            {/* Statements */}
            <section className="mb-10">
              <h2 style={{ fontFamily: serif, fontSize: 20, fontWeight: 600 }} className="mb-1">Statements</h2>
              <div style={{ fontFamily: sans, fontSize: 12.5, color: C.muted, marginBottom: 14 }}>
                Portfolio-level returns, struck at the close of each week and month.
              </div>

              <div style={{ fontFamily: mono, fontSize: 10.5, letterSpacing: 1.5, color: C.gold, marginBottom: 8 }}>WEEKLY</div>
              <div className="flex gap-4 overflow-x-auto pb-3 mb-6">
                {weeklyReturns.length === 0 && <div style={{ color: C.muted, fontSize: 13 }}>No completed weeks yet.</div>}
                {weeklyReturns.map((w, i) => (
                  <StampBadge key={w.key} topLabel={w.label} value={w.return} live={w.key === currentWeekKey} rotate={i % 2 === 0 ? -4 : 3} />
                ))}
              </div>

              {weeklyReturns.length > 0 && (
                <div className="mb-6">
                  <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
                    <div style={{ fontFamily: mono, fontSize: 10.5, letterSpacing: 1.5, color: C.gold }}>WEEKLY vs. INDICES</div>
                    <span style={{ fontFamily: sans, fontSize: 11, color: C.faint }}>
                      {syncUrl ? 'auto-synced from your backend' : 'set up sync above to fill this in automatically'}
                    </span>
                  </div>
                  <div className="overflow-x-auto rounded-sm" style={{ border: `1px solid ${C.hairline}`, background: C.panel }}>
                    <table style={{ borderCollapse: 'collapse' }}>
                      <thead>
                        <tr style={{ borderBottom: `1px solid ${C.hairline}` }}>
                          <th style={{ fontFamily: mono, fontSize: 10.5, color: C.muted, textAlign: 'left', padding: '8px 12px', position: 'sticky', left: 0, background: C.panel }}>WEEK</th>
                          <th style={{ fontFamily: mono, fontSize: 10.5, color: C.gold, textAlign: 'right', padding: '8px 12px', whiteSpace: 'nowrap' }}>PORTFOLIO</th>
                          {NSE_INDICES.map(ix => (
                            <th key={ix} style={{ fontFamily: mono, fontSize: 10.5, color: C.muted, textAlign: 'right', padding: '8px 12px', whiteSpace: 'nowrap' }}>{ix}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {[...weeklyReturns].reverse().map((w, ri) => {
                          const iw = indexWeeklyReturns.find(r => r.key === w.key);
                          return (
                            <tr key={w.key} style={{ borderBottom: ri === weeklyReturns.length - 1 ? 'none' : `1px solid ${C.hairline}` }}>
                              <td style={{ padding: '6px 12px', fontFamily: mono, fontSize: 12, color: C.muted, whiteSpace: 'nowrap', position: 'sticky', left: 0, background: C.panel }}>{w.label}</td>
                              <td style={{ padding: '6px 12px', textAlign: 'right', fontFamily: mono, fontSize: 12.5, fontWeight: 700, color: changeColor(w.return) }}>{fmtPct(w.return)}</td>
                              {NSE_INDICES.map(ix => {
                                const v = iw ? iw.returns[ix] : undefined;
                                return (
                                  <td key={ix} style={{ padding: '4px 10px', textAlign: 'right', fontFamily: mono, fontSize: 12, color: v === undefined ? C.faint : changeColor(v) }}>
                                    {v === undefined ? '—' : fmtPct(v)}
                                  </td>
                                );
                              })}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  <div style={{ fontFamily: sans, fontSize: 11, color: C.faint, marginTop: 6 }}>
                    Filled in automatically once your sync backend is running — see the setup panel in the Day Book section above.
                  </div>
                </div>
              )}

              <div style={{ fontFamily: mono, fontSize: 10.5, letterSpacing: 1.5, color: C.gold, marginBottom: 8 }}>MONTHLY</div>
              <div className="flex gap-4 overflow-x-auto pb-3">
                {monthlyReturns.length === 0 && <div style={{ color: C.muted, fontSize: 13 }}>No completed months yet.</div>}
                {monthlyReturns.map((m, i) => (
                  <StampBadge key={m.key} topLabel={m.label} value={m.return} live={m.key === currentMonthKey} rotate={i % 2 === 0 ? 4 : -3} />
                ))}
              </div>
            </section>

            {/* Chart */}
            {chartData.length > 1 && (
              <section className="mb-4">
                <h2 style={{ fontFamily: serif, fontSize: 20, fontWeight: 600 }} className="mb-3">Value Over Time</h2>
                <div className="rounded-sm p-4" style={{ background: C.panel, border: `1px solid ${C.hairline}`, height: 260 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                      <CartesianGrid stroke={C.hairline} strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="date" tick={{ fill: C.muted, fontFamily: mono, fontSize: 10.5 }} axisLine={{ stroke: C.hairline }} tickLine={false} />
                      <YAxis tick={{ fill: C.muted, fontFamily: mono, fontSize: 10.5 }} axisLine={false} tickLine={false} width={70} domain={['auto', 'auto']} />
                      <Tooltip
                        contentStyle={{ background: C.panelAlt, border: `1px solid ${C.hairline2}`, borderRadius: 4, fontFamily: mono, fontSize: 12 }}
                        labelStyle={{ color: C.muted }}
                        formatter={v => [`₹${fmtMoney(v)}`, 'Value']}
                      />
                      <Line type="monotone" dataKey="value" stroke={C.gold} strokeWidth={2} dot={{ r: 2, fill: C.gold }} activeDot={{ r: 4 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </section>
            )}
          </>
        )}

        {saveError && (
          <div style={{ fontFamily: sans, fontSize: 12, color: C.neg, marginTop: 10 }}>
            Could not save your last change — it may not persist after this session.
          </div>
        )}

        <div className="text-center mt-10" style={{ fontFamily: mono, fontSize: 10.5, color: C.faint, letterSpacing: 1 }}>
          CLOSES ARE LOOKED UP VIA CLAUDE, RECORDED BY YOU · WEEK ENDS SUNDAY (ISO) · SAVED TO THIS DEVICE
        </div>
      </div>
    </div>
  );
}
