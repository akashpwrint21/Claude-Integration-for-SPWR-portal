"""
Runs on a schedule via GitHub Actions (see .github/workflows/update-prices.yml).
Fetches NSE closing prices via Yahoo Finance (which mirrors NSE and doesn't
block automated requests, unlike nseindia.com) for a fixed watchlist, and
merges the result into data/prices.json and data/indices.json.

Those two JSON files are what the portal actually reads, via GitHub's raw
file host (raw.githubusercontent.com) — which sends CORS headers, so a
browser page is actually allowed to fetch it. That's the missing piece
nseindia.com can never provide directly to a webpage.

Output shape (both files): { "YYYY-MM-DD": { "SYMBOL": price, ... }, ... }
Existing dates are kept; only new/changed dates get merged in, so history
accumulates over time even though each run only re-checks the last ~7 days.
"""

import json
import os
from datetime import datetime

import yfinance as yf

DATA_DIR = os.path.join(os.path.dirname(__file__), "data")
PRICES_PATH = os.path.join(DATA_DIR, "prices.json")
INDICES_PATH = os.path.join(DATA_DIR, "indices.json")

WATCHLIST = [
    "360ONE", "3MINDIA", "ABB", "ACC", "AIAENG", "APLAPOLLO", "AUBANK", "AARTIIND", "AAVAS", "ABBOTINDIA",
    "ACE", "ADANIENSOL", "ADANIENT", "ADANIGREEN", "ADANIPORTS", "ADANIPOWER", "ATGL", "AWL", "ABCAPITAL", "ABFRL",
    "AEGISLOG", "AETHER", "AFFLE", "AJANTPHARM", "APLLTD", "ALKEM", "ALKYLAMINE", "ALLCARGO", "ALOKINDS", "ARE&M",
    "AMBER", "AMBUJACEM", "ANANDRATHI", "ANGELONE", "ANURAS", "APARINDS", "APOLLOHOSP", "APOLLOTYRE", "APTUS", "ACI",
    "ASAHIINDIA", "ASHOKLEY", "ASIANPAINT", "ASTERDM", "ASTRAZEN", "ASTRAL", "ATUL", "AUROPHARMA", "AVANTIFEED", "DMART",
    "AXISBANK", "BEML", "BLS", "BSE", "BAJAJ-AUTO", "BAJFINANCE", "BAJAJFINSV", "BAJAJHLDNG", "BALAMINES", "BALKRISIND",
    "BALRAMCHIN", "BANDHANBNK", "BANKBARODA", "BANKINDIA", "MAHABANK", "BATAINDIA", "BAYERCROP", "BERGEPAINT", "BDL", "BEL",
    "BHARATFORG", "BHEL", "BPCL", "BHARTIARTL", "BIKAJI", "BIOCON", "BIRLACORPN", "BSOFT", "BLUEDART", "BLUESTARCO",
    "BBTC", "BORORENEW", "BOSCHLTD", "BRIGADE", "BRITANNIA", "MAPMYINDIA", "CCL", "CESC", "CGPOWER", "CIEINDIA",
    "CRISIL", "CSBBANK", "CAMPUS", "CANFINHOME", "CANBK", "CAPLIPOINT", "CGCL", "CARBORUNIV", "CASTROLIND", "CEATLTD",
    "CELLO", "CENTRALBK", "CDSL", "CENTURYPLY", "ABREL", "CERA", "CHALET", "CHAMBLFERT", "CHEMPLASTS", "CHENNPETRO",
    "CHOLAHLDNG", "CHOLAFIN", "CIPLA", "CUB", "CLEAN", "COALINDIA", "COCHINSHIP", "COFORGE", "COLPAL", "CAMS",
    "CONCORDBIO", "CONCOR", "COROMANDEL", "CRAFTSMAN", "CREDITACC", "CROMPTON", "CUMMINSIND", "CYIENT", "DCMSHRIRAM", "DLF",
    "DOMS", "DABUR", "DALBHARAT", "DATAPATTNS", "DEEPAKFERT", "DEEPAKNTR", "DELHIVERY", "DEVYANI", "DIVISLAB", "DIXON",
    "LALPATHLAB", "DRREDDY", "EIDPARRY", "EIHOTEL", "EPL", "EASEMYTRIP", "EICHERMOT", "ELECON", "ELGIEQUIP", "EMAMILTD",
    "ENDURANCE", "ENGINERSIN", "EQUITASBNK", "ERIS", "ESCORTS", "EXIDEIND", "FDC", "NYKAA", "FEDERALBNK", "FACT",
    "FINEORG", "FINCABLES", "FINPIPE", "FSL", "FIVESTAR", "FORTIS", "GAIL", "GMMPFAUDLR", "GMRINFRASTRUCT", "GRSE",
    "GICRE", "GILLETTE", "GLAND", "GLAXO", "ALIVUS", "GLENMARK", "MEDANTA", "GPIL", "GODFRYPHLP", "GODREJCP",
    "GODREJIND", "GODREJPROP", "GRANULES", "GRAPHITE", "GRASIM", "GESHIP", "GRINDWELL", "GAEL", "FLUOROCHEM", "GUJGASLTD",
    "GMDCLTD", "GNFC", "GPPL", "GSFC", "GSPL", "HEG", "HBLENGINE", "HCLTECH", "HDFCAMC", "HDFCBANK",
    "HDFCLIFE", "HFCL", "HAPPSTMNDS", "HAPPYFORGE", "HAVELLS", "HEROMOTOCO", "HSCL", "HINDALCO", "HAL", "HINDCOPPER",
    "HINDPETRO", "HINDUNILVR", "HINDZINC", "POWERINDIA", "HOMEFIRST", "HONASA", "HONAUT", "HUDCO", "ICICIBANK", "ICICIGI",
    "ICICIPRULI", "ISEC", "IDBI", "IDFCFIRSTB", "IFCI", "IIFL", "IRB", "IRCON", "ITC", "ITI",
    "INDIACEM", "INDIAMART", "INDIANB", "IEX", "INDHOTEL", "IOC", "IOB", "IRCTC", "IRFC", "INDIGOPNTS",
    "IGL", "INDUSTOWER", "INDUSINDBK", "NAUKRI", "INFY", "INOXWIND", "INTELLECT", "INDIGO", "IPCALAB", "JBCHEPHARM",
    "JKCEMENT", "JBMA", "JKLAKSHMI", "JKPAPER", "JMFINANCIL", "JSWENERGY", "JSWINFRA", "JSWSTEEL", "JAIBALAJI", "J&KBANK",
    "JINDALSAW", "JSL", "JINDALSTEL", "JIOFIN", "JUBLFOOD", "JUBLINGREA", "JUBLPHARMA", "JWL", "JUSTDIAL", "JYOTHYLAB",
    "KPRMILL", "KEI", "KNRCON", "KPITTECH", "KRBL", "KSB", "KAJARIACER", "KPIL", "KALYANKJIL", "KANSAINER",
    "KARURVYSYA", "KAYNES", "KEC", "KFINTECH", "KOTAKBANK", "KIMS", "LTF", "LTTS", "LICHSGFIN", "LTIM",
    "LT", "LATENTVIEW", "LAURUSLABS", "LXCHEM", "LEMONTREE", "LICI", "LINDEINDIA", "LLOYDSME", "LUPIN", "MMTC",
    "MRF", "MTARTECH", "LODHA", "MGL", "MAHSEAMLES", "M&MFIN", "M&M", "MHRIL", "MAHLIFE", "MANAPPURAM",
    "MRPL", "MANKIND", "MARICO", "MARUTI", "MASTEK", "MFSL", "MAXHEALTH", "MAZDOCK", "MEDPLUS", "METROBRAND",
    "METROPOLIS", "MINDACORP", "MSUMI", "MOTILALOFS", "MPHASIS", "MCX", "MUTHOOTFIN", "NATCOPHARM", "NBCC", "NCC",
    "NHPC", "NLCINDIA", "NMDC", "NSLNISP", "NTPC", "NH", "NATIONALUM", "NAVINFLUOR", "NESTLEIND", "NETWORK18",
    "NAM-INDIA", "NUVAMA", "NUVOCO", "OBEROIRLTY", "ONGC", "OIL", "OLECTRA", "PAYTM", "OFSS", "POLICYBZR",
    "PCBL", "PIIND", "PNBHOUSING", "PNCINFRA", "PVRINOX", "PAGEIND", "PATANJALI", "PERSISTENT", "PETRONET", "PHOENIXLTD",
    "PIDILITIND", "PEL", "PPLPHARMA", "POLYMED", "POLYCAB", "POONAWALLA", "PFC", "POWERGRID", "PRAJIND", "PRESTIGE",
    "PRINCEPIPE", "PRSMJOHNSN", "PGHH", "PNB", "QUESS", "RRKABEL", "RBLBANK", "RECLTD", "RHIM", "RITES",
    "RADICO", "RVNL", "RAILTEL", "RAINBOW", "RAJESHEXPO", "RKFORGE", "RCF", "RATNAMANI", "RTNINDIA", "RAYMOND",
    "REDINGTON", "RELIANCE", "RBA", "ROUTE", "SBFC", "SBICARD", "SBILIFE", "SJVN", "SKFINDIA", "SRF",
    "SAFARI", "SAMMAANCAP", "MOTHERSON", "SANOFI", "SAPPHIRE", "SAREGAMA", "SCHAEFFLER", "SCHNEIDER", "SHREECEM", "RENUKA",
    "SHRIRAMFIN", "SHYAMMETL", "SIEMENS", "SIGNATURE", "SOBHA", "SOLARINDS", "SONACOMS", "SONATSOFTW", "STARHEALTH", "SBIN",
    "SAIL", "SWSOLAR", "STLTECH", "SUMICHEM", "SPARC", "SUNPHARMA", "SUNTV", "SUNDARMFIN", "SUNDRMFAST", "SUNTECK",
    "SUPREMEIND", "SUVENPHAR", "SUZLON", "SWANENERGY", "SYNGENE", "SYRMA", "TBOTEK", "TVSMOTOR", "TVSSCS", "TMB",
    "TANLA", "TATACHEM", "TATACOMM", "TCS", "TATACONSUM", "TATAELXSI", "TATAINVEST", "TATAMOTORS", "TATAPOWER", "TATASTEEL",
    "TATATECH", "TTML", "TECHM", "TEJASNET", "NIACL", "RAMCOCEM", "THERMAX", "TIMKEN", "TITAGARH", "TITAN",
    "TORNTPHARM", "TORNTPOWER", "TRENT", "TRIDENT", "TRIVENI", "TRITURBINE", "TIINDIA", "UCOBANK", "UNOMINDA", "UPL",
    "UTIAMC", "UJJIVANSFB", "ULTRACEMCO", "UNIONBANK", "UBL", "UNITDSPR", "USHAMART", "VGUARD", "VIPIND", "VAIBHAVGBL",
    "VTL", "VARROC", "VBL", "MANYAVAR", "VEDL", "VIJAYA", "IDEA", "VOLTAS", "WELCORP", "WELSPUNLIV",
    "WESTLIFE", "WHIRLPOOL", "WIPRO", "YESBANK", "ZFCVINDIA", "ZEEL", "ZENSARTECH", "ETERNAL", "ZYDUSLIFE", "ECLERX",
    "ATHERENERG", "HYUNDAI", "NTPCGREEN", "VMM", "BAJAJHFL", "OLAELEC", "WAAREEENER", "PREMIERENE", "BHARTIHEXA", "MOBIKWIK",
]

# NSE index name -> Yahoo Finance ticker. Best-effort: indices not listed
# here (or where Yahoo's ticker has changed) are simply skipped — the
# portal already treats a missing index value as "not filled in yet"
# rather than an error. Tell Claude which index is missing and it can be
# added here.
INDEX_TICKERS = {
    "NIFTY 50": "^NSEI",
    "NIFTY BANK": "^NSEBANK",
    "NIFTY IT": "^CNXIT",
    "NIFTY AUTO": "^CNXAUTO",
    "NIFTY PHARMA": "^CNXPHARMA",
    "NIFTY FMCG": "^CNXFMCG",
    "NIFTY METAL": "^CNXMETAL",
    "NIFTY REALTY": "^CNXREALTY",
    "NIFTY MEDIA": "^CNXMEDIA",
    "NIFTY ENERGY": "^CNXENERGY",
    "NIFTY INFRA": "^CNXINFRA",
    "NIFTY PSU BANK": "^CNXPSUBANK",
}


def load_json(path):
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return {}


def save_json(path, data):
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=0, sort_keys=True)


def merge_history(existing, ticker_to_key, period="7d"):
    """Batch-download `period` of daily closes for the given tickers and
    merge them into `existing` (date -> {key: close}), keyed by the plain
    NSE symbol / index name rather than the Yahoo ticker."""
    tickers = list(ticker_to_key.keys())
    if not tickers:
        return existing
    data = yf.download(
        tickers=tickers,
        period=period,
        interval="1d",
        group_by="ticker",
        threads=True,
        progress=False,
        auto_adjust=False,
    )
    for yahoo_ticker, key in ticker_to_key.items():
        try:
            sub = data[yahoo_ticker] if len(tickers) > 1 else data
            closes = sub["Close"].dropna()
        except Exception:
            continue
        for date_idx, close in closes.items():
            date_str = date_idx.strftime("%Y-%m-%d")
            existing.setdefault(date_str, {})[key] = round(float(close), 2)
    return existing


def main():
    os.makedirs(DATA_DIR, exist_ok=True)

    stock_tickers = {f"{sym}.NS": sym for sym in WATCHLIST}
    prices = load_json(PRICES_PATH)
    prices = merge_history(prices, stock_tickers)
    save_json(PRICES_PATH, prices)
    print(f"prices.json: {len(prices)} dates, {len(WATCHLIST)} symbols in watchlist")

    index_tickers = {yt: name for name, yt in INDEX_TICKERS.items()}
    indices = load_json(INDICES_PATH)
    indices = merge_history(indices, index_tickers)
    save_json(INDICES_PATH, indices)
    print(f"indices.json: {len(indices)} dates, {len(INDEX_TICKERS)} indices in watchlist")

    print(f"Done at {datetime.utcnow().isoformat()}Z")


if __name__ == "__main__":
    main()
