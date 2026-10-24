#!/usr/bin/env python3
"""Generate public/sites/hospital/site.json: "Demo City Hospital", a made-up AIIMS-scale building.

Four blocks form a ring around a garden courtyard (about 180 m x 120 m), four floors, ~45 rooms per floor.
A walkway crosses the garden on the ground floor and a skywalk crosses it on the first floor, so most trips
have two or three possible routes and the shortest one depends on where the visitor is standing.

Run:  python3 tools/gen_hospital.py      (then `npm test`)
The layout lives here so the JSON stays consistent; hand-edit names in this file, not in site.json.
"""
import json
import pathlib
import re

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / 'public' / 'sites' / 'hospital' / 'site.json'

# ---------- geometry (8 units = 1 m) ----------
# Ring: outer box 0..1440 x 0..960, courtyard 240..1200 x 240..720.
# Each wing: outer rooms (100 deep) | corridor (40) | inner rooms (100) facing the courtyard.
CORR = {'N': ('y', 120), 'S': ('y', 840), 'W': ('x', 120), 'E': ('x', 1320)}   # corridor centre lines
CORR_SPAN = (120, 1320)  # N/S corridors run x 120..1320; W/E run y 120..840
CORR_SPAN_V = (120, 840)

# side -> (axis rooms run along, cross-range lo..hi, door line, corridor)
SIDES = {
    'N_out': ('x', 0, 100, 100, 'N'),
    'N_in': ('x', 140, 240, 140, 'N'),
    'S_in': ('x', 720, 820, 820, 'S'),
    'S_out': ('x', 860, 960, 860, 'S'),
    'W_out': ('y', 0, 100, 100, 'W'),
    'W_in': ('y', 140, 240, 140, 'W'),
    'E_in': ('y', 1200, 1300, 1300, 'E'),
    'E_out': ('y', 1340, 1440, 1340, 'E'),
}

FLOORS = [
    ('GF', 'G', 'Ground Floor', 'भूतल', 'Emergency, registration, OPDs, X-ray, pharmacy, canteen, garden walkway',
     'इमरजेंसी, पंजीकरण, ओपीडी, एक्स-रे, फ़ार्मेसी, कैंटीन, बगीचे का रास्ता'),
    ('1F', '1', 'First Floor', 'पहली मंज़िल', 'Blood bank, labs, CT, ultrasound, specialty OPDs, billing, skywalk',
     'ब्लड बैंक, लैब, सीटी, अल्ट्रासाउंड, विशेषज्ञ ओपीडी, बिलिंग, स्काईवॉक'),
    ('2F', '2', 'Second Floor', 'दूसरी मंज़िल', 'ICU, NICU, wards, labour room, private rooms',
     'आईसीयू, एनआईसीयू, वार्ड, लेबर रूम, प्राइवेट कमरे'),
    ('3F', '3', 'Third Floor', 'तीसरी मंज़िल', 'Operation theatres, OT waiting, burns ward, library, offices, staff canteen',
     'ऑपरेशन थिएटर, ओटी प्रतीक्षा, बर्न वार्ड, लाइब्रेरी, कार्यालय, स्टाफ कैंटीन'),
]
LINK_FLOORS = {'GF', '1F'}  # garden walkway (GF) and skywalk (1F) at x = 720

# Lifts and stairs: same place on every floor (same group = one shaft).
CORES = [
    # id suffix, kind, side, along lo..hi, en, hi, enS, hiS
    ('S1', 'stairs', 'W_out', 100, 180, 'Stairs 1 (north-west)', 'सीढ़ियाँ 1 (उत्तर-पश्चिम)', 'Stairs 1', 'सीढ़ियाँ 1'),
    ('S2', 'stairs', 'W_out', 780, 860, 'Stairs 2 (south-west)', 'सीढ़ियाँ 2 (दक्षिण-पश्चिम)', 'Stairs 2', 'सीढ़ियाँ 2'),
    ('S3', 'stairs', 'E_out', 100, 180, 'Stairs 3 (north-east)', 'सीढ़ियाँ 3 (उत्तर-पूर्व)', 'Stairs 3', 'सीढ़ियाँ 3'),
    ('S4', 'stairs', 'E_out', 780, 860, 'Stairs 4 (south-east)', 'सीढ़ियाँ 4 (दक्षिण-पूर्व)', 'Stairs 4', 'सीढ़ियाँ 4'),
    ('S5', 'stairs', 'S_in', 740, 800, 'Stairs 5 (main lobby)', 'सीढ़ियाँ 5 (मुख्य लॉबी)', 'Stairs 5', 'सीढ़ियाँ 5'),
    ('LA', 'lift', 'S_in', 620, 700, 'Lift A (OPD Block)', 'लिफ्ट A (ओपीडी ब्लॉक)', 'Lift A', 'लिफ्ट A'),
    ('LB', 'lift', 'W_in', 240, 320, 'Lift B (bed lift, Emergency Block)', 'लिफ्ट B (बेड लिफ्ट, इमरजेंसी ब्लॉक)', 'Lift B', 'लिफ्ट B'),
    ('LC', 'lift', 'N_in', 740, 820, 'Lift C (Ward Block)', 'लिफ्ट C (वार्ड ब्लॉक)', 'Lift C', 'लिफ्ट C'),
    ('LD', 'lift', 'E_in', 640, 720, 'Lift D (Academic Block)', 'लिफ्ट D (अकादमिक ब्लॉक)', 'Lift D', 'लिफ्ट D'),
]

# Free stretches of each side (between lifts/stairs/link), shared by all floors.
SEGMENTS = {
    'N_out': [(0, 1440)],
    'N_in': [(140, 700), (820, 1300)],
    'S_in': [(140, 620), (800, 1300)],
    'S_out': [(0, 1440)],
    'W_out': [(180, 780)],
    'W_in': [(320, 720)],
    'E_in': [(240, 640)],
    'E_out': [(180, 780)],
}
# Ground-floor openings in the outer rows for the three gates and the main lobby.
GF_GAPS = {'S_out': (640, 800), 'W_out': (440, 520), 'N_out': (960, 1040)}


def segments(fid, side):
    """Free stretches of a side on one floor (ground-floor gates/lobby cut the outer rows in two)."""
    segs = SEGMENTS[side]
    if fid == 'GF' and side in GF_GAPS:
        g0, g1 = GF_GAPS[side]
        out = []
        for lo, hi in segs:
            out += [(lo, g0), (g1, hi)] if lo < g0 < hi else [(lo, hi)]
        return out
    if side == 'S_out':  # upper floors: two lists, split at the lobby line
        return [(0, 720), (720, 1440)]
    return segs


def R(en, hi, cat, kw='', id=None, code=None, w=1.0, enS=None, hiS=None):
    return dict(en=en, hi=hi, cat=cat, kw=kw, id=id, code=code, w=w, enS=enS, hiS=hiS)


def WC(id):
    return R('Toilets (Gents & Ladies)', 'शौचालय (पुरुष और महिला)', 'service',
             'toilet washroom bathroom latrine shauchalay peshab शौचालय टॉयलेट', id=id, code='WC', w=0.6,
             enS='Toilets', hiS='शौचालय')


def opd(en, hi, kw, id=None, rooms=2):
    """A department: its OPD hall plus numbered consultation rooms (searchable by the department name)."""
    out = [R(f'{en} OPD', f'{hi} ओपीडी', 'opd', kw, id=id, w=1.2)]
    out += [R(f'{en} Consultation {i}', f'{hi} परामर्श कक्ष {i}', 'opd', kw, w=0.7) for i in range(1, rooms + 1)]
    return out


def util(en, hi, cat='admin', kw='', w=0.6):
    # keep "(south)" etc. in the short name: several nursing stations share a floor
    return R(en, hi, cat, kw, w=w, enS=en, hiS=hi)


# ---------- rooms: floor -> side -> one list per free segment ----------
ROOMS = {
    'GF': {
        'S_out': [
            [WC('GF-WC'),
             R('Ayushman Bharat Help Desk', 'आयुष्मान भारत सहायता केंद्र', 'service', 'ayushman pmjay card golden card free ilaj yojana आयुष्मान', id='G-10', enS='Ayushman Desk', hiS='आयुष्मान डेस्क'),
             R('ATM & Bank Counter', 'एटीएम और बैंक काउंटर', 'service', 'atm bank paise cash money nikalna एटीएम पैसे', id='GF-ATM', code='ATM', w=0.7, enS='ATM', hiS='एटीएम'),
             R('Enquiry & Help Desk', 'पूछताछ और सहायता', 'service', 'enquiry inquiry help puchtaach information पूछताछ मदद', id='GF-ENQ', code='i', w=0.8, enS='Enquiry', hiS='पूछताछ'),
             R('Registration (OPD slip)', 'पंजीकरण (ओपीडी पर्ची)', 'service', 'registration parchi slip card new patient opd card पर्ची पंजीकरण रजिस्ट्रेशन', id='GF-REG', code='REG', w=1.6, enS='Registration', hiS='पंजीकरण')],
            [R('Pharmacy', 'दवा वितरण केंद्र', 'service', 'pharmacy dawai dawa medicine medical store chemist दवाई दवा', id='GF-PHARM', code='Rx', w=1.4),
             R('Jan Aushadhi Kendra (low-cost medicines)', 'जन औषधि केंद्र (सस्ती दवाइयाँ)', 'service', 'jan aushadhi sasti dawai generic cheap medicine सस्ती दवा', id='GF-JAK', code='JAK', enS='Jan Aushadhi', hiS='जन औषधि'),
             R('Canteen', 'कैंटीन', 'food', 'canteen food khana chai tea coffee nashta bhojan कैंटीन खाना चाय', id='GF-CAN', code='CAN', w=1.3),
             R('Wheelchair & Stretcher Point', 'व्हीलचेयर और स्ट्रेचर केंद्र', 'service', 'wheelchair stretcher trolley व्हीलचेयर स्ट्रेचर', id='GF-WHL', code='WHL', w=0.7, enS='Wheelchairs', hiS='व्हीलचेयर'),
             R('Drinking Water (RO)', 'पीने का पानी (आरओ)', 'food', 'water pani drinking peene ka pani पानी', id='GF-H2O', code='H2O', w=0.5, enS='Drinking Water', hiS='पीने का पानी'),
             WC('GF-WC4')],
        ],
        'S_in': [
            [*opd('Orthopaedics', 'हड्डी रोग', 'bones haddi joint fracture plaster ortho हड्डी', id='G-04', rooms=1),
             R('Surgery OPD', 'सर्जरी ओपीडी', 'opd', 'surgery operation general surgery सर्जरी', id='G-03'),
             R('General Medicine OPD', 'मेडिसिन ओपीडी', 'opd', 'medicine fever bukhar general physician doctor बुखार', id='G-07', w=1.3, enS='Medicine OPD', hiS='मेडिसिन ओपीडी')],
            [*opd('Paediatrics', 'बाल रोग', 'child bachcha kids baby paediatric बच्चे', id='G-05', rooms=1),
             R('ENT OPD', 'नाक-कान-गला ओपीडी', 'opd', 'ent ear nose throat kaan naak gala कान नाक गला', id='G-06', enS='ENT', hiS='नाक-कान-गला'),
             R('Eye OPD', 'नेत्र ओपीडी', 'opd', 'eye aankh ophthalmology chashma आँख', id='G-02'),
             R('Sample Collection (blood test)', 'सैंपल कलेक्शन (खून जाँच)', 'test', 'sample blood test khoon jaanch urine lab collection सैंपल जाँच', id='G-09', enS='Sample Collection', hiS='सैंपल कलेक्शन')],
        ],
        'W_out': [
            [R('Trauma ICU', 'ट्रॉमा आईसीयू', 'emergency', 'trauma icu accident serious', id='G-15'),
             R('Casualty Observation', 'कैजुअल्टी ऑब्ज़र्वेशन', 'emergency', 'casualty observation', id='G-16')],
            [R('Emergency', 'आपातकालीन विभाग', 'emergency', 'emergency accident aapat casualty ambulance chot injury इमरजेंसी आपातकालीन', id='G-01', w=1.5, enS='Emergency', hiS='इमरजेंसी'),
             util('Emergency Doctors Room', 'इमरजेंसी डॉक्टर कक्ष', 'emergency')],
        ],
        'W_in': [
            [R('X-Ray', 'एक्स-रे', 'test', 'xray x-ray radiography एक्सरे', id='G-08'),
             R('MRI', 'एमआरआई', 'test', 'mri scan', id='G-11'),
             R('Emergency Lab (24x7)', 'इमरजेंसी लैब (24 घंटे)', 'test', 'emergency lab test night', id='G-12', enS='Emergency Lab', hiS='इमरजेंसी लैब'),
             util('Plaster Room', 'प्लास्टर कक्ष', 'emergency', 'plaster fracture')],
        ],
        'E_in': [
            [R('Day Care', 'डे केयर', 'ward', 'day care', id='G-27'),
             R('Minor OT', 'माइनर ओटी', 'emergency', 'minor operation stitches tanke', id='G-28'),
             util('Dressing Room', 'ड्रेसिंग कक्ष', 'emergency', 'dressing patti'),
             WC('GF-WC3')],
        ],
        'E_out': [
            [R('Endoscopy', 'एंडोस्कोपी', 'test', 'endoscopy', id='G-29'),
             *opd('Dental', 'दंत रोग', 'dental teeth daant dentist दाँत', id='G-30', rooms=0),
             R('Security & Lost and Found', 'सुरक्षा और खोया-पाया', 'admin', 'security guard lost found khoya paya सुरक्षा', id='GF-SEC', code='SEC', w=0.8, enS='Security', hiS='सुरक्षा')],
        ],
        'N_in': [
            [*opd('Dermatology', 'त्वचा रोग', 'skin twacha khujli rash चमड़ी त्वचा', id='G-17', rooms=0),
             *opd('Psychiatry', 'मनोरोग', 'mental tension depression neend मानसिक', id='G-18', rooms=0),
             R('Vaccination Centre', 'टीकाकरण केंद्र', 'service', 'vaccine tika injection teeka टीका', id='G-19', enS='Vaccination', hiS='टीकाकरण')],
            [*opd('Nephrology', 'गुर्दा रोग', 'kidney gurda nephro गुर्दा', id='G-20', rooms=0),
             *opd('Oncology', 'कैंसर', 'cancer tumour oncology कैंसर', id='G-21', rooms=0),
             WC('GF-WC2')],
        ],
        'N_out': [
            [R('Admission & Discharge', 'भर्ती और छुट्टी', 'admin', 'admission bharti discharge chutti admit भर्ती छुट्टी', id='GF-ADM', code='ADM', w=1.3),
             R('Dharamshala & Rain Basera Desk', 'धर्मशाला और रैन बसेरा डेस्क', 'service', 'dharamshala rain basera stay raat rukna sona attendant room night shelter धर्मशाला रैन बसेरा', id='GF-DHR', code='DHR', enS='Dharamshala Desk', hiS='धर्मशाला डेस्क'),
             R('Attendant Waiting Hall', 'परिजन प्रतीक्षा हॉल', 'service', 'waiting attendant family baithna intezaar प्रतीक्षा', id='GF-WAIT', code='WAIT', w=1.4, enS='Waiting Hall', hiS='प्रतीक्षा हॉल'),
             R('Police Post', 'पुलिस चौकी', 'admin', 'police complaint mlc पुलिस', id='GF-POL', code='POL', w=0.6),
             util('Medical Social Worker', 'मेडिकल सोशल वर्कर', 'service', 'social worker financial help garib madad'),
             util('Store', 'भंडार कक्ष')],
            [*opd('Chest & TB', 'छाती और टीबी', 'tb tuberculosis cough khansi chest lungs टीबी खांसी', id='G-23', rooms=0),
             R('Infectious Diseases OPD', 'संक्रामक रोग ओपीडी', 'opd', 'infection dengue malaria', id='G-24', enS='Infectious Diseases', hiS='संक्रामक रोग')],
        ],
    },
    '1F': {
        'S_out': [
            [WC('1F-WC'),
             R('Billing Counter', 'बिलिंग काउंटर', 'service', 'bill billing payment fees paisa jama cash counter बिल भुगतान', id='109', w=1.2),
             R('Medical Records', 'मेडिकल रिकॉर्ड', 'admin', 'records file report copy certificate रिकॉर्ड रिपोर्ट', id='110'),
             R('Report Collection', 'रिपोर्ट वितरण', 'service', 'report collection lab report result रिपोर्ट', id='130', enS='Reports', hiS='रिपोर्ट'),
             R('Waiting Lounge', 'प्रतीक्षा लाउंज', 'service', 'waiting', id='1F-WAIT', code='WAIT', w=1.2)],
            [*opd('Neurology', 'न्यूरो', 'brain nerve paralysis lakwa seizure mirgi न्यूरो दिमाग', id='111', rooms=1),
             *opd('Gastroenterology', 'पेट रोग', 'stomach pet liver gas gastro पेट', id='112', rooms=1),
             R('Urology OPD', 'मूत्र रोग ओपीडी', 'opd', 'urine kidney stone pathri prostate', id='113', enS='Urology', hiS='मूत्र रोग')],
        ],
        'S_in': [
            [*opd('Cardiology', 'हृदय रोग', 'heart dil bp chest pain cardiology हृदय दिल', id='105', rooms=1),
             R('Gynaecology OPD', 'स्त्री रोग ओपीडी', 'opd', 'pregnancy gynae women mahila delivery garbh स्त्री रोग', id='106', enS='Gynae OPD', hiS='स्त्री रोग')],
            [R('Pathology Lab', 'पैथोलॉजी लैब', 'test', 'pathology lab test report', id='102'),
             R('Microbiology Lab', 'माइक्रोबायोलॉजी लैब', 'test', 'culture microbiology', id='115'),
             R('Biochemistry Lab', 'बायोकेमिस्ट्री लैब', 'test', 'sugar thyroid lft kft', id='116'),
             R('ECG & Echo', 'ईसीजी और इको', 'test', 'ecg echo tmt heart test', id='114')],
        ],
        'W_out': [
            [R('Blood Bank', 'ब्लड बैंक (रक्त कोष)', 'test', 'blood bank khoon unit donor rakt blood chahiye ब्लड रक्त खून', id='101', w=1.3, enS='Blood Bank', hiS='ब्लड बैंक'),
             R('Blood Donation Room', 'रक्तदान कक्ष', 'test', 'blood donation donate raktdaan रक्तदान', id='117', enS='Blood Donation', hiS='रक्तदान'),
             util('Blood Bank Store', 'ब्लड बैंक स्टोर', 'test')],
        ],
        'W_in': [
            [R('CT Scan', 'सीटी स्कैन', 'test', 'ct scan', id='103'),
             R('Ultrasound', 'अल्ट्रासाउंड', 'test', 'ultrasound sonography usg sonography', id='104'),
             R('Mammography', 'मैमोग्राफी', 'test', 'mammography breast', id='118')],
        ],
        'E_in': [
            [R('Dialysis Unit', 'डायलिसिस यूनिट', 'ward', 'dialysis kidney', id='107', w=1.4, enS='Dialysis', hiS='डायलिसिस'),
             util('Dialysis Store', 'डायलिसिस स्टोर', 'ward'),
             WC('1F-WC2')],
        ],
        'E_out': [
            [R('Physiotherapy', 'फिजियोथेरेपी', 'opd', 'physio exercise kasrat physiotherapy फिजियो', id='108', w=1.4),
             R('Audiology & Speech', 'श्रवण और वाणी जाँच', 'test', 'hearing sunna audiology speech', id='119', enS='Audiology', hiS='श्रवण जाँच'),
             util('Occupational Therapy', 'ऑक्युपेशनल थेरेपी', 'opd')],
        ],
        'N_in': [
            [*opd('Endocrinology', 'मधुमेह और हार्मोन', 'diabetes sugar thyroid hormone मधुमेह शुगर', id='120', rooms=1),
             *opd('Rheumatology', 'गठिया रोग', 'arthritis gathiya joint pain गठिया', id='121', rooms=1)],
            [R('Day Care Chemotherapy', 'डे केयर कीमोथेरेपी', 'ward', 'chemo chemotherapy cancer', id='123', w=1.3, enS='Chemotherapy', hiS='कीमोथेरेपी'),
             R('Nuclear Medicine', 'न्यूक्लियर मेडिसिन', 'test', 'pet scan nuclear', id='122'),
             WC('1F-WC3')],
        ],
        'N_out': [
            [*opd('Pulmonology', 'फेफड़ा रोग', 'lungs saans asthma breathing फेफड़े सांस', id='125', rooms=1),
             R('Sleep Lab', 'स्लीप लैब', 'test', 'sleep neend snoring', id='126'),
             R('Cath Lab', 'कैथ लैब', 'test', 'angiography angioplasty stent cath', id='127', w=1.3),
             R('Cardiac Care Unit (CCU)', 'हृदय गहन चिकित्सा इकाई (सीसीयू)', 'ward', 'ccu heart icu cardiac', id='128', w=1.3, enS='CCU', hiS='सीसीयू'),
             util('Nursing Station', 'नर्सिंग स्टेशन', 'admin', 'nurse sister'),
             util('Doctors Duty Room', 'डॉक्टर ड्यूटी कक्ष')],
        ],
    },
    '2F': {
        'S_out': [
            [WC('2F-WC'),
             R('Male Ward A', 'पुरुष वार्ड A', 'ward', 'male ward purush', id='202', w=1.3),
             R('Male Ward B', 'पुरुष वार्ड B', 'ward', 'male ward purush', id='203', w=1.3),
             util('Nursing Station (south)', 'नर्सिंग स्टेशन (दक्षिण)', 'admin', 'nurse sister')],
            [R('Female Ward A', 'महिला वार्ड A', 'ward', 'female ward mahila', id='204', w=1.3),
             R('Female Ward B', 'महिला वार्ड B', 'ward', 'female ward mahila', id='205', w=1.3),
             R('Medical Ward', 'मेडिकल वार्ड', 'ward', 'medicine ward', id='219', w=1.3)],
        ],
        'S_in': [
            [R('Child Ward', 'बाल वार्ड', 'ward', 'child ward bachcha', id='206', w=1.3),
             R('Attendant Rest Area', 'परिजन विश्राम क्षेत्र', 'service', 'rest attendant aaram family', id='210', enS='Rest Area', hiS='विश्राम क्षेत्र')],
            [R('Dietician', 'आहार विशेषज्ञ', 'service', 'diet food dietician', id='209'),
             R('Private Rooms', 'प्राइवेट कमरे', 'ward', 'private room cabin', id='211', w=1.3),
             util('Linen Store', 'लिनन स्टोर')],
        ],
        'W_out': [
            [R('Intensive Care Unit (ICU)', 'गहन चिकित्सा इकाई (आईसीयू)', 'ward', 'icu intensive care serious ventilator आईसीयू', id='201', w=1.5, enS='ICU', hiS='आईसीयू'),
             R('ICU Attendant Waiting', 'आईसीयू परिजन प्रतीक्षा', 'service', 'icu waiting attendant', id='224', enS='ICU Waiting', hiS='आईसीयू प्रतीक्षा')],
        ],
        'W_in': [
            [R('Post-op Ward', 'पोस्ट-ऑप वार्ड', 'ward', 'post operation recovery', id='207'),
             R('High Dependency Unit (HDU)', 'हाई डिपेंडेंसी यूनिट (एचडीयू)', 'ward', 'hdu', id='208', enS='HDU', hiS='एचडीयू'),
             util('Doctors Duty Room', 'डॉक्टर ड्यूटी कक्ष')],
        ],
        'E_in': [
            [R('Isolation Ward', 'आइसोलेशन वार्ड', 'ward', 'isolation infection', id='213'),
             util('Nursing Station (east)', 'नर्सिंग स्टेशन (पूर्व)', 'admin', 'nurse sister'),
             WC('2F-WC2')],
        ],
        'E_out': [
            [R('Orthopaedic Ward', 'हड्डी रोग वार्ड', 'ward', 'ortho ward fracture', id='214', w=1.3),
             R('Surgical Ward', 'सर्जिकल वार्ड', 'ward', 'surgery ward', id='215', w=1.3)],
        ],
        'N_in': [
            [R('Maternity Ward', 'प्रसूति वार्ड', 'ward', 'maternity delivery pregnancy prasav प्रसूति', id='216', w=1.3),
             R('Labour Room', 'लेबर रूम (प्रसव कक्ष)', 'ward', 'labour room delivery prasav', id='217', enS='Labour Room', hiS='लेबर रूम'),
             R('Neonatal ICU (NICU)', 'नवजात आईसीयू (एनआईसीयू)', 'ward', 'nicu newborn baby navjat', id='212', enS='NICU', hiS='एनआईसीयू')],
            [R('Paediatric ICU (PICU)', 'बाल आईसीयू (पीआईसीयू)', 'ward', 'picu child icu', id='218', enS='PICU', hiS='पीआईसीयू'),
             util('Breastfeeding Room', 'स्तनपान कक्ष', 'service', 'feeding mother baby'),
             WC('2F-WC3')],
        ],
        'N_out': [
            [R('Cancer Ward', 'कैंसर वार्ड', 'ward', 'cancer oncology ward', id='220', w=1.3),
             R('Cardiac Ward', 'हृदय वार्ड', 'ward', 'heart ward', id='221', w=1.3),
             R('Neuro Ward', 'न्यूरो वार्ड', 'ward', 'neuro brain ward', id='222', w=1.3),
             R('Day Ward', 'डे वार्ड', 'ward', 'day ward', id='223', w=1.3),
             util('Nursing Station (north)', 'नर्सिंग स्टेशन (उत्तर)', 'admin', 'nurse sister'),
             util('Store', 'भंडार कक्ष')],
        ],
    },
    '3F': {
        'S_out': [
            [WC('3F-WC'),
             R('Medical Superintendent Office', 'चिकित्सा अधीक्षक कार्यालय', 'admin', 'ms superintendent complaint shikayat', id='305', enS='MS Office', hiS='एमएस कार्यालय'),
             R('Admin Office', 'प्रशासनिक कार्यालय', 'admin', 'admin office', id='306'),
             R('Accounts', 'लेखा विभाग', 'admin', 'accounts refund', id='322')],
            [R('Library', 'पुस्तकालय', 'admin', 'library books', id='307', w=1.3),
             R('Conference Room', 'सम्मेलन कक्ष', 'admin', 'conference meeting', id='308'),
             R('Hostel Office', 'छात्रावास कार्यालय', 'admin', 'hostel', id='323')],
        ],
        'S_in': [
            [R('Burns Ward', 'बर्न वार्ड', 'ward', 'burn jalna aag', id='303', w=1.2),
             R('Plastic Surgery Ward', 'प्लास्टिक सर्जरी वार्ड', 'ward', 'plastic surgery', id='312')],
            [R('Seminar Hall', 'सेमिनार हॉल', 'admin', 'seminar hall', id='304', w=1.3),
             R('Lecture Theatre', 'व्याख्यान कक्ष', 'admin', 'lecture class', id='313', w=1.2)],
        ],
        'W_out': [
            [R('Operation Theatres', 'ऑपरेशन थिएटर', 'ward', 'ot operation theatre theater', id='301', w=1.6, enS='OT Complex', hiS='ऑपरेशन थिएटर'),
             R('OT Waiting Area', 'ओटी प्रतीक्षा क्षेत्र', 'service', 'ot waiting operation family wait', id='302', enS='OT Waiting', hiS='ओटी प्रतीक्षा')],
        ],
        'W_in': [
            [R('Recovery Room', 'रिकवरी कक्ष', 'ward', 'recovery after operation', id='311'),
             R('CSSD (sterilisation)', 'सीएसएसडी (कीटाणुशोधन)', 'admin', 'cssd sterilisation', id='309', enS='CSSD', hiS='सीएसएसडी'),
             util('Anaesthesia Store', 'एनेस्थीसिया स्टोर', 'admin')],
        ],
        'E_in': [
            [R('Skills Lab', 'स्किल्स लैब', 'admin', 'skills simulation training', id='314'),
             util('Faculty Room', 'शिक्षक कक्ष', 'admin'),
             WC('3F-WC2')],
        ],
        'E_out': [
            [R('Anatomy Museum', 'शरीर रचना संग्रहालय', 'admin', 'museum anatomy', id='315'),
             R('Research Lab', 'अनुसंधान प्रयोगशाला', 'test', 'research lab', id='316'),
             util('Store', 'भंडार कक्ष')],
        ],
        'N_in': [
            [R('Telemedicine Centre', 'टेलीमेडिसिन केंद्र', 'admin', 'telemedicine esanjeevani video', id='317'),
             R('IT & Server Room', 'आईटी और सर्वर कक्ष', 'admin', 'it computer server', id='318')],
            [R('Staff Canteen', 'स्टाफ कैंटीन', 'food', 'canteen staff food khana chai', id='310', w=1.3),
             R('Staff Room', 'स्टाफ कक्ष', 'admin', 'staff', id='319'),
             WC('3F-WC3')],
        ],
        'N_out': [
            [R("Director's Office", 'निदेशक कार्यालय', 'admin', 'director', id='320'),
             R("Dean's Office", 'डीन कार्यालय', 'admin', 'dean academic', id='321'),
             R('Department Offices', 'विभागीय कार्यालय', 'admin', 'department hod office', id='324', w=1.3),
             R('Examination Hall', 'परीक्षा हॉल', 'admin', 'exam', id='325', w=1.3),
             util('Record Room', 'अभिलेख कक्ष', 'admin')],
        ],
    },
}
# Filler names for the many small rooms of a real hospital (duty rooms, stores, consultation rooms).
FILLER = {
    'GF': [('OPD Consultation', 'ओपीडी परामर्श कक्ष', 'opd'), ('Doctors Duty Room', 'डॉक्टर ड्यूटी कक्ष', 'admin'),
           ('Nursing Station', 'नर्सिंग स्टेशन', 'admin'), ('Store', 'भंडार कक्ष', 'admin')],
    '1F': [('Specialty Consultation', 'विशेषज्ञ परामर्श कक्ष', 'opd'), ('Lab Store', 'लैब स्टोर', 'test'),
           ('Doctors Duty Room', 'डॉक्टर ड्यूटी कक्ष', 'admin'), ('Counselling Room', 'परामर्श कक्ष', 'service')],
    '2F': [('Ward Side Room', 'वार्ड साइड रूम', 'ward'), ('Nursing Station', 'नर्सिंग स्टेशन', 'admin'),
           ('Doctors Duty Room', 'डॉक्टर ड्यूटी कक्ष', 'admin'), ('Store', 'भंडार कक्ष', 'admin')],
    '3F': [('Faculty Room', 'शिक्षक कक्ष', 'admin'), ('Store', 'भंडार कक्ष', 'admin'),
           ('Tutorial Room', 'ट्यूटोरियल कक्ष', 'admin'), ('Doctors Duty Room', 'डॉक्टर ड्यूटी कक्ष', 'admin')],
}
TARGET_PER_FLOOR = 46  # the user asked for 40-50 rooms per floor


def short(s):
    return re.sub(r'\s*\(.*\)$', '', s)


class Builder:
    def __init__(self):
        self.points = {}      # (floor, x, y) -> id
        self.on_corr = {}     # (floor, corridor) -> set(along)
        self.places, self.cores, self.walks = [], [], []
        self.used_ids = set()

    def point(self, f, corr, along):
        axis, line = CORR[corr]
        x, y = (along, line) if axis == 'y' else (line, along)
        key = (f, x, y)
        if key not in self.points:
            self.points[key] = f'{f}-{corr}{along}'
        self.on_corr.setdefault((f, corr), set()).add(along)
        return self.points[key]

    def extra_point(self, f, pid, x, y):
        self.points[(f, x, y)] = pid
        return pid


def split(seg, items):
    lo, hi = seg
    total = sum(i['w'] for i in items)
    out, cur = [], lo
    for k, it in enumerate(items):
        end = hi if k == len(items) - 1 else cur + round((hi - lo) * it['w'] / total / 10) * 10
        out.append((cur, end, it))
        cur = end
    return out


def place_rect(side, a0, a1):
    axis, c0, c1, door_line, corr = SIDES[side]
    if axis == 'x':
        rect = [a0, c0, a1, c1]
    else:
        rect = [c0, a0, c1, a1]
    span = CORR_SPAN if axis == 'x' else CORR_SPAN_V
    mid = min(max((a0 + a1) // 2, span[0] + 10), span[1] - 10)
    mid = int(round(mid / 2) * 2)
    door = [mid, door_line] if axis == 'x' else [door_line, mid]
    return rect, door, mid, corr


def build():
    b = Builder()
    for fid, *_ in FLOORS:
        # corridor ends / junctions
        for c in 'NS':
            b.point(fid, c, 120); b.point(fid, c, 1320)
        for c in 'WE':  # same coordinates as the N/S ends, so the corner junctions are shared points
            b.point(fid, c, 120); b.point(fid, c, 840)

    # Rooms, with filler so each floor reaches TARGET_PER_FLOOR.
    for fid, prefix, *_ in FLOORS:
        rooms = ROOMS[fid]
        count = sum(len(lst) for segs in rooms.values() for lst in segs)
        filler, k = FILLER[fid], 0
        # add filler rooms round-robin to the longest outer rows
        order = ['N_out', 'S_out', 'E_out', 'W_out', 'N_in', 'S_in']
        while count < TARGET_PER_FLOOR:
            side = order[k % len(order)]
            segs, spans = rooms[side], segments(fid, side)
            seg_i = max(range(len(segs)), key=lambda i: (spans[i][1] - spans[i][0]) / (1 + len(segs[i])))
            en, hi, cat = filler[k % len(filler)]
            n = k // len(filler) + 1
            segs[seg_i].append(R(f'{en} {n}', f'{hi} {n}', cat, '', w=0.6))
            count += 1; k += 1

        nums = {'GF': 31, '1F': 131, '2F': 225, '3F': 326}
        nxt = nums[fid]
        for side, seg_lists in rooms.items():
            segs = segments(fid, side)
            assert len(segs) == len(seg_lists), (fid, side, len(segs), len(seg_lists))
            for seg, items in zip(segs, seg_lists):
                for a0, a1, it in split(seg, items):
                    rect, door, mid, corr = place_rect(side, a0, a1)
                    pid = it['id']
                    if not pid:
                        pid = f'G-{nxt:02d}' if fid == 'GF' else str(nxt)
                        nxt += 1
                    assert pid not in b.used_ids, pid
                    b.used_ids.add(pid)
                    via = b.point(fid, corr, mid)
                    p = dict(id=pid, floor=fid, cat=it['cat'], en=it['en'], hi=it['hi'],
                             enS=it['enS'] or short(it['en']), hiS=it['hiS'] or short(it['hi']),
                             kw=(it['kw'] + ' ' + it['en'].lower()).strip(), rect=rect, door=door, via=via)
                    if it['code']:
                        p['code'] = it['code']
                    num = bool(re.match(r'^(\d|[A-Z]-\d)', pid))
                    if not num and not it['code']:
                        p['code'] = pid.split('-')[-1][:4]
                    b.places.append(p)

        # pantries in the link slots on floors without a link
        if fid not in LINK_FLOORS:
            for side, rect, door, corr in [('N_in', [700, 140, 740, 240], [720, 140], 'N'), ('S_in', [700, 720, 740, 820], [720, 820], 'S')]:
                pid = f'{fid}-PAN{1 if side == "N_in" else 2}'
                b.places.append(dict(id=pid, floor=fid, cat='food', en='Pantry', hi='पैंट्री', enS='Pantry', hiS='पैंट्री',
                                     kw='pantry water garam pani tea', code='PAN', rect=rect, door=door, via=b.point(fid, corr, 720)))

        # lifts and stairs
        for sid, kind, side, a0, a1, en, hi, enS, hiS in CORES:
            rect, door, mid, corr = place_rect(side, a0, a1)
            at = [(rect[0] + rect[2]) // 2, (rect[1] + rect[3]) // 2]
            b.cores.append(dict(id=f'{fid}-{sid}', floor=fid, kind=kind, group=sid, rect=rect, at=at, door=door,
                                via=b.point(fid, corr, mid), en=en, hi=hi, enS=enS, hiS=hiS))

        # garden walkway / skywalk across the courtyard
        if fid in LINK_FLOORS:
            b.point(fid, 'N', 720); b.point(fid, 'S', 720)
            mid = b.extra_point(fid, f'{fid}-L480', 720, 480)
            b.walks.append([b.points[(fid, 720, 120)], mid])
            b.walks.append([mid, b.points[(fid, 720, 840)]])

    # Gates (ground floor) with a small vestibule point inside each door.
    gates = [
        ('GF-GATE3', 'Gate 3 · Main Entrance', 'गेट 3 · मुख्य द्वार', 'Gate 3', 'गेट 3', 'Main Entrance', 'मुख्य द्वार',
         'gate exit entrance bahar nikalna main gate parking गेट', 'G3', [720, 960], (720, 900), ('S', 720), [720, 1010],
         [[690, 960], [750, 960], [760, 990], [680, 990]]),
        ('GF-GATE1', 'Gate 1 · Emergency & Ambulance', 'गेट 1 · इमरजेंसी और एम्बुलेंस', 'Gate 1', 'गेट 1', 'Emergency & Ambulance',
         'इमरजेंसी और एम्बुलेंस', 'gate 1 ambulance emergency gate गेट', 'G1', [0, 480], (50, 480), ('W', 480), [-70, 480],
         [[0, 450], [0, 510], [-30, 520], [-30, 440]]),
        ('GF-GATE2', 'Gate 2 · Ward Block (IPD)', 'गेट 2 · वार्ड ब्लॉक (आईपीडी)', 'Gate 2', 'गेट 2', 'Ward Block (IPD)', 'वार्ड ब्लॉक (आईपीडी)',
         'gate 2 ward ipd visitors गेट', 'G2', [1000, 0], (1000, 50), ('N', 1000), [1000, -50],
         [[970, 0], [1030, 0], [1040, -30], [960, -30]]),
    ]
    for gid, en, hi, enS, hiS, subEn, subHi, kw, code, door, vest, (corr, along), label, mat in gates:
        v = b.extra_point('GF', f'GF-V{gid[-1]}', *vest)
        b.walks.append([v, b.point('GF', corr, along)])
        b.places.append(dict(id=gid, floor='GF', gate=True, door=door, via=v, labelAt=label, mat=mat, cat='service', code=code,
                             en=en, hi=hi, enS=enS, hiS=hiS, subEn=subEn, subHi=subHi, kw=kw))

    # Corridor walks: chain every point along each corridor; corner junctions shared between corridors.
    for fid, *_ in FLOORS:
        for corr, (axis, line) in CORR.items():
            alongs = sorted(b.on_corr.get((fid, corr), set()))
            ids = []
            for a in alongs:
                x, y = (a, line) if axis == 'y' else (line, a)
                ids.append(b.points[(fid, x, y)])
            for p, q in zip(ids, ids[1:]):
                b.walks.append([p, q])

    # Shared junction keys: (120,120) etc. exist once per floor because point() keys by coordinates.
    pts = [dict(id=pid, floor=f, x=x, y=y) for (f, x, y), pid in b.points.items()]
    return b, pts


def main():
    b, pts = build()
    ids = [p['id'] for p in pts] + [p['id'] for p in b.places] + [c['id'] for c in b.cores]
    assert len(ids) == len(set(ids)), 'duplicate ids'

    floors = [dict(id=f, btn=btn, en=en, hi=hi, sumEn=se, sumHi=sh) for f, btn, en, hi, se, sh in FLOORS]
    wings = [[0, 0, 1440, 240], [0, 720, 1440, 960], [0, 240, 240, 720], [1200, 240, 1440, 720]]
    shells = {f: wings + ([[700, 240, 740, 720]] if f in LINK_FLOORS else []) for f, *_ in FLOORS}
    openings = []
    for f, *_ in FLOORS:
        openings += [dict(floor=f, at=at) for at in [[120, 240], [120, 720], [1320, 240], [1320, 720]]]
        if f in LINK_FLOORS:
            openings += [dict(floor=f, at=at) for at in [[720, 240], [720, 720]]]

    courtyard_trees = [[x, y] for x in (310, 420, 530, 640, 800, 910, 1020, 1130) for y in (300, 420, 540, 660)]
    edge_trees = [[x, -150] for x in range(-160, 1620, 140) if abs(x - 1000) > 70] + \
                 [[x, 1110] for x in (-160, -20, 1460, 1600)] + [[x, y] for x in (640, 800) for y in (1130, 1220)] + \
                 [[-170, y] for y in range(-40, 1000, 140) if abs(y - 480) > 90] + [[1610, y] for y in range(-40, 1000, 140)]

    landmarks = {}
    for f, *_ in FLOORS:
        def name(x, y):
            return b.points.get((f, x, y))
        landmarks[name(120, 120)] = dict(en='the north-west corner (Stairs 1)', hi='उत्तर-पश्चिम कोने (सीढ़ियाँ 1)')
        landmarks[name(1320, 120)] = dict(en='the north-east corner (Stairs 3)', hi='उत्तर-पूर्व कोने (सीढ़ियाँ 3)')
        landmarks[name(120, 840)] = dict(en='the south-west corner (Stairs 2)', hi='दक्षिण-पश्चिम कोने (सीढ़ियाँ 2)')
        landmarks[name(1320, 840)] = dict(en='the south-east corner (Stairs 4)', hi='दक्षिण-पूर्व कोने (सीढ़ियाँ 4)')
        if name(720, 840):
            landmarks[name(720, 840)] = dict(en='the main lobby' if f == 'GF' else 'the lift lobby above the main entrance',
                                             hi='मुख्य लॉबी' if f == 'GF' else 'मुख्य द्वार के ऊपर वाली लिफ्ट लॉबी')
        if (f, 720, 480) in b.points:
            landmarks[b.points[(f, 720, 480)]] = dict(en='the garden walkway' if f == 'GF' else 'the skywalk over the garden',
                                                      hi='बगीचे के रास्ते' if f == 'GF' else 'बगीचे के ऊपर स्काईवॉक')

    # Usual busy hours (an estimate a hospital can fill in from experience; not live tracking).
    def corridor(f, axis, line, lo, hi):
        return [pid for (ff, x, y), pid in b.points.items() if ff == f and (y if axis == 'y' else x) == line and lo <= (x if axis == 'y' else y) <= hi]
    busy = [
        dict(id='reg-rush', level=3, hours=[[8, 13]], en='the registration and pharmacy corridor', hi='पंजीकरण और फ़ार्मेसी वाला गलियारा',
             nodes=corridor('GF', 'y', 840, 240, 1200)),
        dict(id='opd-wait', level=2, hours=[[9, 14]], en='the OPD waiting corridor (north)', hi='ओपीडी प्रतीक्षा गलियारा (उत्तर)',
             nodes=corridor('GF', 'y', 120, 140, 700)),
        dict(id='billing', level=2, hours=[[10, 16]], en='the billing and reports corridor', hi='बिलिंग और रिपोर्ट वाला गलियारा',
             nodes=corridor('1F', 'y', 840, 120, 1320)),
        dict(id='visiting', level=2, hours=[[16, 19]], en='the ward corridors (visiting hours)', hi='वार्ड के गलियारे (मिलने का समय)',
             nodes=[pid for (ff, x, y), pid in b.points.items() if ff == '2F']),
        dict(id='emergency', level=1, hours=[[0, 24]], en='the Emergency Block corridor', hi='इमरजेंसी ब्लॉक का गलियारा',
             nodes=corridor('GF', 'x', 120, 120, 840)),
    ]

    site = dict(
        id='hospital',
        tab=dict(en='Hospital', hi='अस्पताल'),
        name=dict(en='Demo City Hospital', hi='डेमो सिटी अस्पताल'),
        floors=floors,
        shells=shells,
        openings=openings,
        ground={'GF': [[-260, -230], [1700, -230], [1700, 1250], [-260, 1250]]},
        roads={'GF': [
            dict(w=56, pts=[[-110, -90], [1550, -90], [1550, 1060], [-110, 1060], [-110, -90]]),
            dict(w=64, pts=[[720, 1250], [720, 1060]]),
            dict(w=48, pts=[[-260, 480], [-110, 480]]),
            dict(w=40, pts=[[-110, 480], [-40, 480]]),
            dict(w=48, pts=[[1000, -230], [1000, -90]]),
            dict(w=150, pts=[[100, 1150], [560, 1150]]),
            dict(w=150, pts=[[880, 1150], [1340, 1150]]),
            dict(w=24, pts=[[720, 300], [720, 660]]),
            dict(w=20, pts=[[300, 480], [1140, 480]]),
        ]},
        trees={'GF': courtyard_trees + edge_trees},
        busy=busy,
        points=pts,
        walks=b.walks,
        places=b.places,
        cores=b.cores,
        landmarks={k: v for k, v in landmarks.items() if k},
        defaults=dict(start='GF-GATE3', dest='G-07'),
        quick=['GF-REG', '101', 'GF-PHARM', 'G-09', 'WC', 'G-01'],
        popular=['GF-REG', 'G-07', '101', 'G-09', 'GF-PHARM', 'G-08', '109', '201', 'GF-DHR', 'GF-CAN', 'GF-ATM', '302'],
        cats=['opd', 'test', 'ward', 'emergency', 'service', 'admin', 'food'],
        askPh=dict(en='Try: doctor ne blood laane ko bola hai, X-ray, dawai, ATM', hi='जैसे: डॉक्टर ने खून लाने को बोला है, एक्स-रे, दवाई, एटीएम'),
        notice=dict(en='Demo City Hospital is a made-up, AIIMS-sized building: four blocks around a garden, four floors, '
                       'about 190 rooms. Not a real hospital map.',
                    hi='डेमो सिटी अस्पताल एक काल्पनिक, एम्स जितनी बड़ी इमारत है: बगीचे के चारों ओर चार ब्लॉक, चार मंज़िलें, '
                       'लगभग 190 कमरे। यह किसी असली अस्पताल का नक्शा नहीं है।'),
        help=dict(
            desk='GF-ENQ',
            deskT=dict(en='Enquiry & help desk', hi='पूछताछ और सहायता'),
            deskD=dict(en='Ground Floor, OPD Block, just inside Gate 3 next to Registration. Staff and volunteers there can walk with you.',
                       hi='भूतल, ओपीडी ब्लॉक, गेट 3 से अंदर आते ही पंजीकरण के पास। वहाँ के स्टाफ और स्वयंसेवक आपके साथ चल सकते हैं।'),
            phone=dict(en='Help desk phone: [add number]', hi='हेल्प डेस्क फ़ोन: [नंबर जोड़ें]'),
            emg='G-01',
            emgT=dict(en='Emergency', hi='इमरजेंसी'),
            emgD=dict(en='Ground Floor, Emergency Block (west), next to Gate 1 where ambulances arrive. Open 24 hours.',
                      hi='भूतल, इमरजेंसी ब्लॉक (पश्चिम), गेट 1 के पास जहाँ एम्बुलेंस आती है। 24 घंटे खुला।'),
        ),
        about=dict(
            en=['Demo City Hospital is a made-up building, sized like a big government medical college: four blocks (OPD, '
                'Emergency, Wards, Academic) around a garden, four floors, about 190 rooms, four lifts and five staircases.',
                'Every door and corridor junction is a point and every walkable connection is a line with a length. The route '
                'comes from a shortest-path search (Dijkstra) on that graph. Because the corridors form a ring with a walkway '
                'and a skywalk across the garden, most trips have two or three possible routes; the one shown is the shortest '
                'from where you are standing.',
                'Step-free mode skips the stairs, and "Lift not working" sends people up or down a staircase instead.'],
            hi=['डेमो सिटी अस्पताल एक काल्पनिक इमारत है, किसी बड़े सरकारी मेडिकल कॉलेज जितनी: बगीचे के चारों ओर चार ब्लॉक '
                '(ओपीडी, इमरजेंसी, वार्ड, अकादमिक), चार मंज़िलें, लगभग 190 कमरे, चार लिफ्ट और पाँच सीढ़ियाँ।',
                'हर दरवाज़ा और गलियारे का मोड़ एक बिंदु है और हर चलने लायक जुड़ाव एक लंबाई वाली रेखा। रास्ता इसी ग्राफ़ पर '
                'सबसे छोटे रास्ते की खोज (डाइक्स्ट्रा) से आता है। गलियारे घेरे में हैं और बगीचे के बीच से रास्ता और स्काईवॉक है, '
                'इसलिए ज़्यादातर जगहों के दो-तीन रास्ते होते हैं; दिखाया गया रास्ता आपकी जगह से सबसे छोटा होता है।',
                'बिना सीढ़ी वाला मोड सीढ़ियाँ छोड़ देता है, और "लिफ्ट बंद है" चुनने पर रास्ता सीढ़ियों से जाता है।'],
        ),
        aiRules='\n'.join([
            '- Blood or blood units needed for a patient ("blood chahiye", "khoon chahiye", donors) means 101 (Blood Bank). '
            'Donating blood means 117. A blood test, "khoon ki jaanch" or giving a sample means G-09.',
            '- Medicines or "dawai" means GF-PHARM; cheap or generic medicines means GF-JAK. A new OPD slip, "parchi" or '
            'registration means GF-REG. Admission ("bharti") or discharge ("chutti") means GF-ADM. Paying a bill means 109. '
            'Collecting a test report means 130. Ayushman card or free treatment schemes means G-10.',
            '- Attendants: staying the night, dharamshala, rain basera or a place to sleep means GF-DHR; waiting means GF-WAIT; '
            'food, chai or khana means GF-CAN; drinking water means GF-H2O; money or cash means GF-ATM; a wheelchair or '
            'stretcher means GF-WHL; police means GF-POL; lost things means GF-SEC; help or information means GF-ENQ.',
            '- For toilets, pick the one closest to the visitor, preferring their current floor.',
            '- Health problems: fever or general illness G-07, eyes G-02, bones or joints G-04, children G-05, ear/nose/throat G-06, '
            'skin G-17, mental health G-18, kidney G-20, cancer G-21, cough or TB G-23, teeth G-30, heart or BP 105, '
            'pregnancy 106, brain or paralysis 111, stomach or liver 112, diabetes or thyroid 120, breathing or asthma 125. '
            'An accident, severe pain, heavy bleeding or someone collapsing means G-01 (Emergency).',
            '- A patient in the ICU means 201 (attendants wait at 224). A patient in surgery means 302 (OT waiting area). '
            'A newborn in intensive care means 212. Delivery or labour means 217.',
            '- Going out or leaving means GF-GATE3; the ambulance gate is GF-GATE1.',
        ]),
        blood=dict(bank='101', test='G-09'),
    )
    OUT.write_text(json.dumps(site, ensure_ascii=False, indent=1) + '\n', encoding='utf-8')
    per_floor = {f: sum(1 for p in b.places if p['floor'] == f and not p.get('gate')) for f, *_ in FLOORS}
    print('rooms per floor:', per_floor, '| total places:', len(b.places), '| points:', len(pts), '| walks:', len(b.walks))


if __name__ == '__main__':
    main()
