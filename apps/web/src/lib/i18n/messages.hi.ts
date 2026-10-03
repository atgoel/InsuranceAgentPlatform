export const messagesHi = {
  // Shell
  'app.title': 'बीमा एजेंट प्लेटफॉर्म',
  'shell.today': 'आज',
  'shell.leads': 'लीड्स',
  'shell.customers': 'ग्राहक',
  'shell.book': 'पुस्तक',
  'shell.me': 'मेरा',

  // Auth
  'auth.login': 'लॉगिन',
  'auth.logout': 'लॉगआउट',
  'auth.selectRole': 'अपनी भूमिका चुनें',
  'auth.agent': 'एजेंट',
  'auth.isp': 'आईएसपी',
  'auth.manager': 'प्रबंधक',
  'auth.operator': 'ऑपरेटर',

  // Common
  'common.loading': 'लोड हो रहा है...',
  'common.error': 'कुछ गलत हुआ',
  'common.retry': 'फिर से प्रयास करें',
  'common.cancel': 'रद्द करें',
  'common.save': 'सहेजें',
  'common.delete': 'हटाएं',
  'common.edit': 'संपादित करें',
  'common.close': 'बंद करें',
  'common.noData': 'कोई डेटा नहीं मिला',

  // Errors
  'error.networkError': 'नेटवर्क त्रुटि। कृपया अपना कनेक्शन जांचें।',
  'error.notFound': 'नहीं मिला',
  'error.unauthorized': 'आप इस कार्य को करने के लिए अधिकृत नहीं हैं।',
  'error.forbidden': 'प्रवेश अस्वीकृत',

  // Plurals
  'plural.leads': '{count, plural, one {# लीड} other {# लीड्स}}',
  'plural.customers': '{count, plural, one {# ग्राहक} other {# ग्राहकों}}',

  // Tenancy - Solo Signup (Hindi for M15)
  'tenancy.signup.phone': 'मोबाइल नंबर',
  'tenancy.signup.name': 'पूरा नाम',
  'tenancy.signup.insurer_name': 'बीमाकर्ता का नाम',
  'tenancy.signup.line': 'व्यवसाय की पंक्ति',
  'tenancy.signup.line_life': 'जीवन',
  'tenancy.signup.line_health': 'स्वास्थ्य',
  'tenancy.signup.line_general': 'सामान्य',
  'tenancy.signup.licence_no': 'लाइसेंस नंबर',
  'tenancy.signup.consent_label': 'मैं शर्तों से सहमत हूं',
  'tenancy.signup.continue': 'जारी रखें',
  'tenancy.signup.otp_code': 'ओटीपी कोड',
  'tenancy.signup.verify': 'सत्यापित करें',

  // Tenancy - Solo Plan (Hindi for M19)
  'tenancy.plan.title': 'मेरी योजना',
  'tenancy.plan.metric_customers': 'ग्राहक',
  'tenancy.plan.metric_ai_credits': 'एआई क्रेडिट',
  'tenancy.plan.metric_messages': 'संदेश',
  'tenancy.plan.metric_seats': 'सीटें',
  'tenancy.plan.used': 'इस महीने उपयोग किया गया',
  'tenancy.plan.usage_warning': 'आपने इस महीने के {percent}% उपयोग कर लिए हैं',
  'tenancy.plan.trial_cta_title': 'प्रो में अपग्रेड करें',
  'tenancy.plan.start_trial': '14 दिन की निःशुल्क परीक्षण शुरू करें',
} as const;
