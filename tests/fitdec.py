import struct, datetime as dt
BT = {0x00:('B',1),0x01:('b',1),0x02:('B',1),0x83:('h',2),0x84:('H',2),0x85:('i',4),0x86:('I',4),
      0x07:('s',1),0x88:('f',4),0x89:('d',8),0x0A:('B',1),0x8B:('H',2),0x8C:('I',4),0x0D:('B',1),
      0x8E:('q',8),0x8F:('Q',8),0x90:('Q',8)}
INVALID = {'B':0xFF,'b':0x7F,'H':0xFFFF,'h':0x7FFF,'I':0xFFFFFFFF,'i':0x7FFFFFFF}
EPOCH = dt.datetime(1989,12,31,tzinfo=dt.timezone.utc)

def decode(path):
    d = open(path,'rb').read()
    hs = d[0]; dsize = struct.unpack_from('<I', d, 4)[0]
    i, end = hs, hs + dsize
    defs, msgs, last_ts = {}, [], 0
    while i < end:
        h = d[i]; i += 1
        if h & 0x80:   # compressed timestamp
            lt = (h >> 5) & 3; off = h & 0x1F
            ts = (last_ts & ~0x1F) + off
            if off < (last_ts & 0x1F): ts += 0x20
            last_ts = ts
            df = defs[lt]; rec = {'_ts': ts}
        elif h & 0x40:  # definition
            lt = h & 0x0F; dev = h & 0x20
            arch = d[i+1]; e = '>' if arch else '<'
            gnum = struct.unpack_from(e+'H', d, i+2)[0]; nf = d[i+4]; i += 5
            fields = [(d[i+3*k], d[i+3*k+1], d[i+3*k+2]) for k in range(nf)]; i += 3*nf
            devsize = 0
            if dev:
                nd = d[i]; i += 1
                devsize = sum(d[i+3*k+1] for k in range(nd)); i += 3*nd
            defs[lt] = (gnum, e, fields, devsize)
            continue
        else:
            df = defs[h & 0x0F]; rec = {}
        gnum, e, fields, devsize = df
        for fnum, size, bt in fields:
            fmt, bs = BT.get(bt, ('B',1))
            raw = d[i:i+size]; i += size
            if fmt == 's' or size != bs:
                continue
            v = struct.unpack(e+fmt, raw)[0]
            if INVALID.get(fmt) == v: continue
            rec[fnum] = v
        i += devsize
        if 253 in rec: last_ts = rec[253]
        elif '_ts' in rec: rec[253] = rec['_ts']
        msgs.append((gnum, rec))
    return msgs

def records(path):
    out = []
    for g, r in decode(path):
        if g == 20 and 253 in r:
            out.append({'t': r[253], 'hr': r.get(3), 'cad': r.get(4), 'p': r.get(7),
                        'speed': (r.get(73, r.get(6)) or 0)/1000, 'dist': (r.get(5) or 0)/100,
                        'alt': r.get(78, r.get(2))})
    return out

def sessions(path):
    return [r for g, r in decode(path) if g == 18]
