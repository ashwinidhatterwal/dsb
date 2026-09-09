/* Dhatterwal Suhag Bhandar — lightweight EN/HI customer UI translations.
   Shop/admin/backend records remain English. */
(function(){
  'use strict';
  const KEY='dsb_customer_lang';
  let lang='en';try{lang=localStorage.getItem(KEY)==='hi'?'hi':'en';}catch(_){}
  const originalText = new WeakMap();
  const originalAttrs = new WeakMap();
  const renderedText=new WeakMap();

  const HI = {
    'Could not check promo codes. Please try again.':'प्रोमो कोड की जाँच नहीं हो सकी। कृपया फिर से कोशिश करें।',
    'Live availability is temporarily unavailable. Please retry before ordering.':'अभी उपलब्धता की जानकारी नहीं मिल रही है। ऑर्डर करने से पहले फिर से कोशिश करें।',
    'Connecting to the shop for current availability…':'वर्तमान उपलब्धता के लिए दुकान से जुड़ रहे हैं…',
    'Price and availability are checked before ordering.':'ऑर्डर से पहले कीमत और उपलब्धता की जाँच की जाती है।',
    'Order online · Shop support on WhatsApp':'ऑनलाइन ऑर्डर करें · व्हाट्सऐप पर सहायता',
    'Taking longer than usual. Your order may still be saving.':'सामान्य से अधिक समय लग रहा है। आपका ऑर्डर अभी दर्ज हो सकता है।',
    'Some saved cart data was damaged and has been removed.':'कार्ट की कुछ पुरानी जानकारी खराब थी और हटा दी गई है।',
    'Checking availability and saving your order…':'उपलब्धता जाँचकर आपका ऑर्डर दर्ज कर रहे हैं…',
    'Choose size':'साइज़ चुनें','Choose a size first':'पहले साइज़ चुनें','Select a size before adding to cart.':'कार्ट में जोड़ने से पहले साइज़ चुनें।',
    'Review order':'ऑर्डर देखें','Review your order':'अपना ऑर्डर देखें','Confirm order':'ऑर्डर की पुष्टि करें','Edit details':'जानकारी बदलें',
    'Estimated total':'अनुमानित कुल','Subtotal — fees checked next':'उप-कुल — शुल्क अगले चरण में',
    'Review the final total before confirming your order.':'ऑर्डर की पुष्टि से पहले अंतिम कुल राशि देखें।',
    'UPI payment opens after your order is saved with the confirmed total.':'ऑर्डर अंतिम राशि के साथ दर्ज होने के बाद UPI भुगतान खुलेगा।',
    'Payment is due at delivery.':'भुगतान डिलीवरी के समय करना है।',
    'Could not load the catalogue. Please try again.':'उत्पाद सूची लोड नहीं हो सकी। कृपया फिर से कोशिश करें।',
    'Checking your order':'आपका ऑर्डर जाँचा जा रहा है','Check order status':'ऑर्डर की स्थिति जाँचें','Retry same order':'इसी ऑर्डर के लिए फिर कोशिश करें',
    'Saving your order…':'आपका ऑर्डर दर्ज हो रहा है…','View last order':'पिछला ऑर्डर देखें',
    'Checking again will not create a duplicate order.':'दोबारा जाँचने से दूसरा ऑर्डर नहीं बनेगा।',
    'A previous order attempt needs to be checked.':'पिछले ऑर्डर प्रयास की स्थिति जाँचना जरूरी है।',
    'The connection was interrupted. Check this order before placing another one.':'कनेक्शन टूट गया था। नया ऑर्डर देने से पहले इस ऑर्डर की जाँच करें।',
    'No saved order was found yet. Retry this same order safely.':'अभी दर्ज ऑर्डर नहीं मिला। इसी ऑर्डर के लिए दोबारा कोशिश करें।',
    'Could not check your order yet. Please try again shortly.':'ऑर्डर की जाँच नहीं हो सकी। थोड़ी देर बाद फिर कोशिश करें।',

    'Suhag Bhandar':'सुहाग भंडार',
    'Search lipstick, notebook, shampoo…':'लिपस्टिक, नोटबुक, शैम्पू खोजें…',
    'Search the shop…':'दुकान में खोजें…','Search products…':'उत्पाद खोजें…',
    'Track your order':'अपना ऑर्डर ट्रैक करें','Cart':'कार्ट','Close':'बंद करें','Close cart':'कार्ट बंद करें','Close search':'खोज बंद करें',
    'Everything you need.':'आपकी जरूरत की हर चीज़।','At reasonable Price.':'उचित दाम पर।',
    'Discover daily essentials, beauty, Bangles, fashion and more - original products':'रोज़मर्रा की चीज़ें, ब्यूटी, चूड़ियाँ, फैशन और बहुत कुछ — असली उत्पाद खोजें।',
    'Fresh picks':'ताज़ा पसंद','Fast ordering':'तेज़ ऑर्डरिंग','WhatsApp support':'व्हाट्सऐप सहायता',
    'Track Order':'ऑर्डर ट्रैक करें','Contact':'संपर्क','About':'हमारे बारे में','Returns':'रिटर्न',
    'Popular picks':'लोकप्रिय पसंद','🔥 Popular picks':'🔥 लोकप्रिय पसंद','New arrivals':'नए उत्पाद','✨ New arrivals':'✨ नए उत्पाद','Shop the bazaar':'दुकान से खरीदें',
    'Featured':'विशेष','Newest first':'नए पहले','Price: Low to High':'कीमत: कम से अधिक','Price: High to Low':'कीमत: अधिक से कम','In stock only':'केवल उपलब्ध',
    'Loading products…':'उत्पाद लोड हो रहे हैं…','Loading more products…':'और उत्पाद लोड हो रहे हैं…',
    'Start typing to search products…':'उत्पाद खोजने के लिए टाइप करना शुरू करें…',
    'Previous':'पिछला','Next':'अगला','All':'सभी',
    'Out of stock':'स्टॉक में नहीं','In stock':'स्टॉक में','Currently unavailable':'फिलहाल उपलब्ध नहीं','Buy Now':'अभी खरीदें','+ Add':'+ जोड़ें','Add to cart':'कार्ट में जोड़ें','Go to cart':'कार्ट देखें',
    'Decrease quantity':'मात्रा घटाएँ','Increase quantity':'मात्रा बढ़ाएँ',
    'Product details':'उत्पाद विवरण','No description added yet.':'अभी विवरण उपलब्ध नहीं है।','Related products':'संबंधित उत्पाद',
    'Share':'साझा करें','Size guide':'साइज़ गाइड','Size Guide':'साइज़ गाइड',
    'Customer feedback':'ग्राहक प्रतिक्रिया','Reviews':'समीक्षाएँ','Write a review':'समीक्षा लिखें','Your name':'आपका नाम','Your feedback':'आपकी प्रतिक्रिया','Submit feedback':'प्रतिक्रिया भेजें','Submitting…':'भेजा जा रहा है…',
    'Please enter your name.':'कृपया अपना नाम दर्ज करें।','Thanks for your feedback!':'आपकी प्रतिक्रिया के लिए धन्यवाद!','Anonymous':'गुमनाम',
    'Reviews will appear here once the Google Sheet is connected.':'Google Sheet जुड़ने के बाद समीक्षाएँ यहाँ दिखाई देंगी।',
    "Couldn't load reviews right now.":'अभी समीक्षाएँ लोड नहीं हो सकीं।','No feedback yet — be the first to review this product.':'अभी कोई प्रतिक्रिया नहीं है — इस उत्पाद की पहली समीक्षा करें।',
    'SHOPPING BAG':'शॉपिंग बैग','Your cart':'आपका कार्ट','Items in your cart':'कार्ट में उत्पाद','CHECKOUT':'चेकआउट','Delivery details':'डिलीवरी विवरण',
    'Full name':'पूरा नाम','Phone number':'फोन नंबर','10-digit mobile number':'10 अंकों का मोबाइल नंबर','Delivery address':'डिलीवरी पता','House no, street, village/city, PIN code':'मकान नंबर, गली, गाँव/शहर, पिन कोड',
    'Payment method':'भुगतान का तरीका','Cash on Delivery':'कैश ऑन डिलीवरी','Pay via UPI':'UPI से भुगतान करें','Open UPI app':'UPI ऐप खोलें','Scan or tap, then send your order below.':'स्कैन करें या टैप करें, फिर नीचे अपना ऑर्डर भेजें।',
    'Items':'उत्पाद','Subtotal':'उप-योग','Discount':'छूट','Delivery':'डिलीवरी','Cash on Delivery fee':'कैश ऑन डिलीवरी शुल्क','FREE':'मुफ़्त','Total':'कुल','Clear cart':'कार्ट खाली करें',
    'Clear all items from your cart?':'क्या कार्ट के सभी उत्पाद हटाने हैं?','Your cart is empty':'आपका कार्ट खाली है','Browse products and add something you like.':'उत्पाद देखें और पसंद की चीज़ कार्ट में जोड़ें।','Continue shopping':'खरीदारी जारी रखें','Remove':'हटाएँ',
    'Order ID':'ऑर्डर आईडी','Enter your Order ID and the phone number you used at checkout to see the latest status.':'ताज़ा स्थिति देखने के लिए अपना ऑर्डर आईडी और चेकआउट में दिया फोन नंबर दर्ज करें।','Track order':'ऑर्डर ट्रैक करें','Track another order':'दूसरा ऑर्डर ट्रैक करें',
    'Order received':'ऑर्डर प्राप्त हुआ','Confirmed':'पुष्टि हो गई','Preparing':'तैयार हो रहा है','Out for delivery':'डिलीवरी के लिए निकला','Delivered':'डिलीवर हो गया','Cancelled':'रद्द',
    'Payment':'भुगतान','Order status':'ऑर्डर की स्थिति','Ordered on':'ऑर्डर की तारीख',
    'Place order':'ऑर्डर करें','Promo code':'प्रोमो कोड','Promo code (optional)':'प्रोमो कोड (वैकल्पिक)','optional':'वैकल्पिक','Enter code':'कोड दर्ज करें','Apply':'लागू करें','Free delivery on orders of':'इतनी राशि या अधिक के ऑर्डर पर मुफ्त डिलीवरी','View cart':'कार्ट देखें','You may also like':'आपको ये भी पसंद आ सकते हैं','Ratings & feedback':'रेटिंग और प्रतिक्रिया','Leave your feedback':'अपनी प्रतिक्रिया दें','Your rating':'आपकी रेटिंग','How was the product?':'उत्पाद कैसा था?','Product ID:':'उत्पाद आईडी:',"Couldn't find that product.":'यह उत्पाद नहीं मिला।','← Back to shop':'← दुकान पर वापस जाएँ','Add a few things from the shop and they will appear here.':'दुकान से कुछ उत्पाद जोड़ें, वे यहाँ दिखाई देंगे।','each':'प्रति','Share product':'उत्पाद साझा करें',
    'About Dhatterwal Suhag Bhandar':'धत्तरवाल सुहाग भंडार के बारे में','Shop':'दुकान','How ordering works':'ऑर्डर कैसे करें','Questions before you order?':'ऑर्डर से पहले कोई सवाल?',
    'We stock a wide mix of everyday and festive essentials:':'हम रोज़मर्रा और त्योहारों की जरूरतों के कई प्रकार के उत्पाद रखते हैं:',
    'Lingerie':'लॉन्जरी','Cosmetics':'कॉस्मेटिक्स','Hair Care':'हेयर केयर','Hair Accessories':'हेयर एक्सेसरीज़','Snacks':'स्नैक्स','Cold Drinks':'कोल्ड ड्रिंक्स','Cookies & Biscuits':'कुकीज़ और बिस्कुट','Personal Care':'पर्सनल केयर','Stationery':'स्टेशनरी','Festive & Suhag':'त्योहार और सुहाग',
    'Accessories':'एक्सेसरीज़','Adhesives':'चिपकाने का सामान','Bangles':'चूड़ियाँ','Bindi & Sindoor':'बिंदी और सिंदूर','Bras':'ब्रा','Chips':'चिप्स','Clips':'क्लिप्स','Clutchers':'क्लचर','Combs':'कंघी','Cream Cookies':'क्रीम कुकीज़','Drawing':'ड्रॉइंग','Eyes':'आँखों का मेकअप','Face':'फेस केयर','Geometry':'ज्योमेट्री','Glucose Biscuits':'ग्लूकोज़ बिस्कुट','Grooming':'ग्रूमिंग','Hair Bands':'हेयर बैंड','Hair Oil':'हेयर ऑयल','Handwash':'हैंडवॉश','Juice':'जूस','Kidswear':'बच्चों के कपड़े','Lips':'लिप्स','Marie':'मैरी बिस्कुट','Mehendi':'मेहंदी','Nails':'नेल्स','Namkeen':'नमकीन','Nightwear':'नाइटवियर','Notebooks':'नोटबुक','Panties':'पैंटी','Pens & Pencils':'पेन और पेंसिल','Pooja Items':'पूजा सामग्री','Popcorn':'पॉपकॉर्न','Powder':'पाउडर','Rakhi':'राखी','Shampoo':'शैम्पू','Shapewear':'शेपवियर','Soap':'साबुन','Soda':'सोडा','Styling':'स्टाइलिंग','Sweet Snacks':'मीठे स्नैक्स','Tissues':'टिश्यू','Toothbrush':'टूथब्रश','Toothpaste':'टूथपेस्ट','Water':'पानी',
    'Contact Us':'हमसे संपर्क करें','Call':'कॉल करें','Visit us':'हमारी दुकान पर आएँ','Get directions →':'रास्ता देखें →','Find us on the map':'मानचित्र पर हमें खोजें',
    'Privacy':'गोपनीयता','Privacy Policy':'गोपनीयता नीति','What we collect':'हम क्या जानकारी लेते हैं',"What we don't do":'हम क्या नहीं करते','Where it\'s stored':'जानकारी कहाँ रखी जाती है','Your choices':'आपके विकल्प','Questions':'सवाल',
    'Returns & Refunds':'रिटर्न और रिफंड','Damaged, defective, or wrong item':'क्षतिग्रस्त, खराब या गलत उत्पाद','Hygiene-sensitive items':'स्वच्छता-संवेदनशील उत्पाद','Other items':'अन्य उत्पाद','Refunds':'रिफंड','How to request a return or refund':'रिटर्न या रिफंड कैसे माँगें',

    'Please enter both your Order ID and phone number.':'कृपया ऑर्डर आईडी और फोन नंबर दोनों दर्ज करें।',
    "Order tracking isn't set up yet — message us on WhatsApp for your order status.":'ऑर्डर ट्रैकिंग अभी उपलब्ध नहीं है — ऑर्डर की स्थिति के लिए व्हाट्सऐप पर संदेश भेजें।',
    'Checking…':'जाँच हो रही है…',
    "We couldn't find a matching order. Double-check the Order ID and phone number, or message us on WhatsApp.":'मिलता हुआ ऑर्डर नहीं मिला। ऑर्डर आईडी और फोन नंबर दोबारा जाँचें या व्हाट्सऐप पर संदेश भेजें।',
    'Something went wrong — please try again or message us on WhatsApp.':'कुछ गलत हो गया — फिर से कोशिश करें या व्हाट्सऐप पर संदेश भेजें।',
    'Packed & fulfilled':'पैक और तैयार','COD fee':'COD शुल्क','Ask about this order':'इस ऑर्डर के बारे में पूछें',
    'Goluwala • WhatsApp confirmation follows shortly after ordering':'गोलूवाला • ऑर्डर के बाद व्हाट्सऐप पर पुष्टि जल्द भेजी जाएगी',
    'Goluwala • Order confirmation happens on WhatsApp':'गोलूवाला • ऑर्डर की पुष्टि व्हाट्सऐप पर होती है',
    'This is saved to our order records so we can fulfil and contact you about that order.':'इसे हमारे ऑर्डर रिकॉर्ड में रखा जाता है ताकि हम ऑर्डर पूरा कर सकें और जरूरत पड़ने पर आपसे संपर्क कर सकें।',
    'Reviews are shown publicly on the product page.':'समीक्षाएँ उत्पाद पेज पर सार्वजनिक रूप से दिखाई जाती हैं।',
    'The items you add are stored only in your own browser (not sent to us) until you check out.':'चेकआउट करने तक आपके जोड़े गए उत्पाद केवल आपके ब्राउज़र में रहते हैं और हमें नहीं भेजे जाते।',
    'Message us directly on WhatsApp, or see the':'हमें सीधे व्हाट्सऐप पर संदेश भेजें, या देखें',
    'for our number and location.':'हमारे नंबर और स्थान के लिए।',
    'Contact page':'संपर्क पेज',
    'Privacy Policy':'गोपनीयता नीति','Returns & Refunds':'रिटर्न और रिफंड',
    'Install Suhag Bhandar':'सुहाग भंडार इंस्टॉल करें','Add Suhag Bhandar to Home Screen':'सुहाग भंडार को होम स्क्रीन पर जोड़ें','Install':'इंस्टॉल करें','Add to Home Screen':'होम स्क्रीन पर जोड़ें','Not now':'अभी नहीं',
    'Chat with us on WhatsApp':'व्हाट्सऐप पर हमसे चैट करें'
  };

  const PARAS = {
    'Dhatterwal Suhag Bhandar is a general store based in Goluwala, Hanumangarh, Rajasthan — the kind of shop where you can pick up everything from a lipstick to a notebook to a bar of soap in one visit. This website brings that same shop online, so you can browse from home and have your order confirmed over WhatsApp, the way you\'d naturally message the shop anyway.':'धत्तरवाल सुहाग भंडार गोलूवाला, हनुमानगढ़, राजस्थान में स्थित एक जनरल स्टोर है, जहाँ एक ही जगह पर लिपस्टिक से लेकर नोटबुक और साबुन तक रोज़मर्रा की कई चीज़ें मिलती हैं। यह वेबसाइट उसी दुकान को ऑनलाइन लाती है ताकि आप घर से उत्पाद देख सकें और अपना ऑर्डर आसानी से कर सकें।',
    'Browse the shop, add what you need to your cart, and check out — we\'ll ask for your name, phone number, and delivery address, then your order is sent straight to us on WhatsApp for confirmation. Pay by cash on delivery, or via UPI if that option is shown at checkout.':'दुकान देखें, जरूरत के उत्पाद कार्ट में जोड़ें और चेकआउट करें। हम आपका नाम, फोन नंबर और डिलीवरी पता पूछेंगे। ऑर्डर दर्ज होने के बाद दुकान की ओर से व्हाट्सऐप पर पुष्टि की जाएगी। भुगतान कैश ऑन डिलीवरी या उपलब्ध होने पर UPI से किया जा सकता है।',
    'Message us directly on WhatsApp, or see the Contact page for our number and location.':'हमें सीधे व्हाट्सऐप पर संदेश भेजें, या हमारे नंबर और स्थान के लिए संपर्क पेज देखें।',
    "The fastest way to reach us is WhatsApp — tap below and we'll reply as soon as we can.":'हमसे जल्दी संपर्क करने का सबसे आसान तरीका व्हाट्सऐप है — नीचे टैप करें, हम जल्द से जल्द जवाब देंगे।',
    "This page explains what information this site collects and what happens to it. In short: we collect what we need to fulfil your order, we don't sell or share it, and it stays in our own private records.":'यह पेज बताता है कि वेबसाइट कौन-सी जानकारी लेती है और उसका उपयोग कैसे होता है। संक्षेप में, हम केवल ऑर्डर पूरा करने के लिए जरूरी जानकारी लेते हैं; इसे बेचते या अनावश्यक रूप से साझा नहीं करते और यह हमारे निजी रिकॉर्ड में रहती है।',
    'When you place an order: your name, phone number, delivery address, chosen payment method, and any promo code used. This is saved to our order records so we can fulfil and contact you about that order.':'जब आप ऑर्डर करते हैं: आपका नाम, फोन नंबर, डिलीवरी पता, चुना हुआ भुगतान तरीका और इस्तेमाल किया गया प्रोमो कोड। ऑर्डर पूरा करने और आपसे संपर्क करने के लिए यह जानकारी हमारे ऑर्डर रिकॉर्ड में रखी जाती है।',
    'When you leave a product review: the name you type in, your star rating, and your comment. Reviews are shown publicly on the product page.':'जब आप उत्पाद की समीक्षा देते हैं: आपके द्वारा लिखा नाम, स्टार रेटिंग और टिप्पणी। समीक्षाएँ उत्पाद पेज पर सार्वजनिक रूप से दिखाई जाती हैं।',
    'Your cart: the items you add are stored only in your own browser (not sent to us) until you check out.':'आपका कार्ट: चेकआउट करने तक आपके जोड़े गए उत्पाद केवल आपके ब्राउज़र में रहते हैं और हमें नहीं भेजे जाते।',
    "We don't sell, rent, or share your information with advertisers or other third parties. We don't use tracking cookies or ad networks.":'हम आपकी जानकारी विज्ञापनदाताओं या अन्य तीसरे पक्ष को बेचते, किराये पर देते या साझा नहीं करते। हम ट्रैकिंग कुकी या विज्ञापन नेटवर्क का उपयोग नहीं करते।',
    'Order and review data is stored in a private Google Sheet accessible only to the shop. Product photos may be hosted via Cloudinary. Messages about your order are exchanged over WhatsApp, which has its own privacy policy covering that part of the conversation.':'ऑर्डर और समीक्षा की जानकारी एक निजी Google Sheet में रखी जाती है, जिसकी पहुँच केवल दुकान के पास है। उत्पाद की तस्वीरें Cloudinary पर होस्ट की जा सकती हैं। ऑर्डर से जुड़े संदेश व्हाट्सऐप पर होते हैं और उस हिस्से पर व्हाट्सऐप की अपनी गोपनीयता नीति लागू होती है।',
    'You can ask us to see or delete the order/contact information we hold about you at any time — just message us on WhatsApp.':'आप किसी भी समय अपने ऑर्डर/संपर्क की जानकारी देखने या हटाने के लिए हमसे कह सकते हैं — बस व्हाट्सऐप पर संदेश भेजें।',
    'Contact us anytime via the Contact page.':'संपर्क पेज के माध्यम से कभी भी हमसे संपर्क करें।',
    'This policy may be updated from time to time as the site changes.':'वेबसाइट में बदलाव के साथ यह नीति समय-समय पर अपडेट की जा सकती है।',
    "If something arrives damaged, defective, or isn't what you ordered, message us on WhatsApp within 48 hours of delivery with a photo. We'll arrange a replacement or a full refund.":'यदि कोई उत्पाद क्षतिग्रस्त, खराब या आपके ऑर्डर से अलग मिले, तो डिलीवरी के 48 घंटे के भीतर फोटो के साथ व्हाट्सऐप पर संदेश भेजें। हम रिप्लेसमेंट या पूरा रिफंड देने की व्यवस्था करेंगे।',
    'Lingerie, cosmetics, and personal care items cannot be returned or exchanged once opened or used, for hygiene and safety reasons. This is standard practice across retail for these categories.':'स्वच्छता और सुरक्षा कारणों से लॉन्जरी, कॉस्मेटिक्स और पर्सनल केयर उत्पाद खुलने या इस्तेमाल होने के बाद वापस या एक्सचेंज नहीं किए जा सकते।',
    'Unopened, unused items in their original packaging (stationery, hair accessories, festive items, etc.) can be exchanged within 3 days of delivery. Packaged snacks and cold drinks are not returnable once delivered.':'मूल पैकिंग में बंद और बिना इस्तेमाल किए उत्पाद (स्टेशनरी, हेयर एक्सेसरीज़, त्योहार के सामान आदि) डिलीवरी के 3 दिनों के भीतर एक्सचेंज किए जा सकते हैं। पैकेट वाले स्नैक्स और कोल्ड ड्रिंक्स डिलीवरी के बाद वापस नहीं लिए जाते।',
    'For orders paid via UPI, approved refunds are sent back to the same UPI ID within a few business days. For cash on delivery orders, refunds are given as cash or adjusted against your next order.':'UPI से भुगतान किए ऑर्डर का स्वीकृत रिफंड कुछ कार्यदिवसों में उसी UPI ID पर भेजा जाता है। कैश ऑन डिलीवरी ऑर्डर का रिफंड नकद दिया जा सकता है या अगले ऑर्डर में समायोजित किया जा सकता है।',
    "Message us on WhatsApp with your Order ID and the reason — we'll take it from there.":'अपने ऑर्डर आईडी और कारण के साथ व्हाट्सऐप पर संदेश भेजें — आगे की प्रक्रिया हम बताएँगे।'
  };
  Object.assign(HI, PARAS);


  Object.assign(HI,{
    'Dhatterwal':'धत्तरवाल','Suhag Bhandar':'सुहाग भंडार','GOLUWALA · RAJASTHAN':'गोलूवाला · राजस्थान',
    'Shop by category':'श्रेणी के अनुसार खरीदें','Selected deals':'दुकान की पसंद','More to explore':'और उत्पाद देखें',
    'Enter a name of 2–100 characters.':'नाम में 2 से 100 अक्षर लिखें।','Enter a valid phone number with 10–15 digits.':'10 से 15 अंकों का सही फ़ोन नंबर लिखें।',
    'Enter a complete delivery address of 5–500 characters.':'5 से 500 अक्षरों में पूरा डिलीवरी पता लिखें।','Please place a smaller order with up to 50 different items.':'एक ऑर्डर में अधिकतम 50 अलग-अलग उत्पाद रखें।',
    'Your cart was updated':'आपका कार्ट अपडेट किया गया है','No longer available':'अब उपलब्ध नहीं है','Quantity updated':'मात्रा बदली गई','Price updated':'कीमत बदली गई',
    'Showing saved products. Current prices and stock are checked when you order.':'सहेजी हुई उत्पाद सूची दिखाई जा रही है। ऑर्डर करते समय वर्तमान कीमत और स्टॉक की जाँच होगी।',
    'Showing saved products. Current availability is checked before ordering.':'सहेजी हुई उत्पाद सूची दिखाई जा रही है। ऑर्डर से पहले वर्तमान उपलब्धता की जाँच होगी।',
    'Delivery charges are shown before you confirm your order.':'ऑर्डर की पुष्टि से पहले डिलीवरी शुल्क दिखाया जाएगा।',
    'Ask about delivery to your area':'अपने क्षेत्र में डिलीवरी के बारे में पूछें','Returns & exchanges':'रिटर्न और एक्सचेंज',
    'Contact the shop for product details before ordering.':'ऑर्डर करने से पहले उत्पाद की जानकारी के लिए दुकान से संपर्क करें।',
    'Add shop to Home Screen':'दुकान को होम स्क्रीन पर जोड़ें',
    'Order received':'ऑर्डर प्राप्त हुआ','Confirmed':'पुष्टि हो गई','Packed':'पैक हो गया','Shipped':'भेज दिया गया','Delivered':'डिलीवर हो गया','Cancelled':'रद्द हो गया',
    'Order ID from your order slip':'ऑर्डर पर्ची पर दिया गया ऑर्डर आईडी',
    'Browse the shop, add what you need to your cart, and check out — we\'ll ask for your name, phone number, and delivery address, then your order is saved securely and you receive a downloadable order slip. The shop contacts you on WhatsApp to confirm delivery details. Pay by cash on delivery, or via UPI if that option is shown at checkout.':'दुकान में उत्पाद देखें, कार्ट में जोड़ें और नाम, फ़ोन नंबर व डिलीवरी पता भरें। ऑर्डर दर्ज होने पर डाउनलोड करने योग्य पर्ची मिलेगी। दुकान डिलीवरी की जानकारी की पुष्टि के लिए व्हाट्सऐप पर संपर्क करेगी। भुगतान कैश ऑन डिलीवरी या चेकआउट में उपलब्ध UPI विकल्प से करें।'
  });
  const TITLES_HI={
    'index.html':'धत्तरवाल सुहाग भंडार — ऑनलाइन खरीदारी',
    'about.html':'हमारे बारे में — धत्तरवाल सुहाग भंडार',
    'contact.html':'संपर्क — धत्तरवाल सुहाग भंडार',
    'privacy.html':'गोपनीयता नीति — धत्तरवाल सुहाग भंडार',
    'returns.html':'रिटर्न और रिफंड — धत्तरवाल सुहाग भंडार'
  };
  const ORIGINAL_TITLE=document.title;
  const ATTRS=['placeholder','aria-label','title'];
  const normalize=s=>String(s||'').replace(/\s+/g,' ').trim();
  function dynamicHi(s){
    let m;
    if((m=s.match(/^Delivery: (.+) below (.+) after discounts; free at or above that amount\. Cash on Delivery: (.+) extra\.$/)))return `छूट के बाद ${m[2]} से कम पर डिलीवरी ${m[1]}; इस राशि या अधिक पर मुफ़्त। कैश ऑन डिलीवरी: ${m[3]} अतिरिक्त।`;
    if((m=s.match(/^Photo (\d+) of (\d+)$/)))return `फ़ोटो ${m[1]} / ${m[2]}`;
    if ((m=s.match(/^Size: (.+)$/))) return `साइज़: ${m[1]}`;
    const emojiLead=s.match(/^([\p{Extended_Pictographic}\uFE0F\s]+)(.+)$/u);
    if(emojiLead && HI[emojiLead[2]]) return emojiLead[1]+HI[emojiLead[2]];
    if ((m=s.match(/^(\d+) items?$/))) return `${m[1]} उत्पाद`;
    if ((m=s.match(/^(\d+) products?$/))) return `${m[1]} उत्पाद`;
    if ((m=s.match(/^Only (\d+) in stock$/))) return `स्टॉक में केवल ${m[1]} उपलब्ध`;
    if ((m=s.match(/^Only (\d+) left$/))) return `केवल ${m[1]} बाकी`;
    if ((m=s.match(/^No results for "(.+)"$/))) return `“${m[1]}” के लिए कोई परिणाम नहीं मिला`;
    if ((m=s.match(/^(\d+) reviews?$/))) return `${m[1]} समीक्षाएँ`;
    if ((m=s.match(/^(.+) added to cart$/))) return `${m[1]} कार्ट में जोड़ा गया`;
    return null;
  }
  function translateString(s){
    const n=normalize(s);
    if (!n) return s;
    if (lang==='en') return s;
    return HI[n] || dynamicHi(n) || s;
  }
  function storeText(node){ if(!originalText.has(node)) originalText.set(node,node.nodeValue); }
  function translateTextNode(node){
    if(!node.parentElement || node.parentElement.closest('script,style,noscript,[data-i18n-skip]')) return;
    if(renderedText.has(node) && node.nodeValue!==renderedText.get(node)) originalText.set(node,node.nodeValue);
    storeText(node);
    const original=originalText.get(node);
    if(lang==='en'){ if(node.nodeValue!==original)node.nodeValue=original; renderedText.set(node,original);return; }
    const trimmed=normalize(original); if(!trimmed) return;
    const translated=HI[trimmed] || dynamicHi(trimmed); if(!translated) return;
    const lead=(original.match(/^\s*/)||[''])[0], tail=(original.match(/\s*$/)||[''])[0];
    const next=lead+translated+tail;if(node.nodeValue!==next)node.nodeValue=next;renderedText.set(node,next);
  }
  function translateElement(el){
    if(!(el instanceof Element) || el.closest('[data-i18n-skip]')) return;
    let saved=originalAttrs.get(el);
    if(!saved){ saved={}; originalAttrs.set(el,saved); }
    ATTRS.forEach(a=>{
      if(!el.hasAttribute(a)) return;
      if(!(a in saved)) saved[a]=el.getAttribute(a);
      el.setAttribute(a, lang==='en' ? saved[a] : translateString(saved[a]));
    });
  }
  function translateTree(root=document.body){
    if(!root) return;
    if(root.nodeType===Node.TEXT_NODE){ translateTextNode(root); return; }
    if(root.nodeType===Node.ELEMENT_NODE) translateElement(root);
    const tw=document.createTreeWalker(root,NodeFilter.SHOW_ELEMENT|NodeFilter.SHOW_TEXT);
    let n; while((n=tw.nextNode())) n.nodeType===Node.TEXT_NODE?translateTextNode(n):translateElement(n);
    document.documentElement.lang=lang==='hi'?'hi':'en';
    const page=(location.pathname.split('/').pop()||'index.html'); if(page!=='product.html') document.title=lang==='hi'?(TITLES_HI[page]||ORIGINAL_TITLE):ORIGINAL_TITLE;
    document.querySelectorAll('.lang-toggle').forEach(b=>{const label=lang==='hi'?'EN':'हिं';if(b.textContent!==label)b.textContent=label; b.setAttribute('aria-label',lang==='hi'?'Switch to English':'हिंदी में देखें');});
  }
  function setLang(next){
    lang=next==='hi'?'hi':'en'; try{localStorage.setItem(KEY,lang);}catch(_){} translateTree(document.body);
    document.dispatchEvent(new CustomEvent('dsb:languagechange',{detail:{lang}}));
  }
  function init(){
    document.querySelectorAll('.lang-toggle').forEach(b=>b.addEventListener('click',()=>setLang(lang==='hi'?'en':'hi')));
    translateTree(document.body);
    let scheduled=false;const roots=new Set();
    const obs=new MutationObserver(ms=>{
      ms.forEach(m=>{if(m.type==='characterData'){if(m.target.nodeValue!==renderedText.get(m.target))roots.add(m.target);}else m.addedNodes.forEach(n=>roots.add(n));});
      if(!roots.size || scheduled)return;
      scheduled=true;requestAnimationFrame(()=>{scheduled=false;const batch=[...roots];roots.clear();batch.filter(n=>n.isConnected && !batch.some(parent=>parent!==n && parent.contains?.(n))).forEach(translateTree);});
    });
    obs.observe(document.body,{childList:true,characterData:true,subtree:true});
  }
  window.DSB_I18N={get lang(){return lang;},isHindi:()=>lang==='hi',t:translateString,setLang,apply:translateTree};
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',init,{once:true}); else init();
})();
