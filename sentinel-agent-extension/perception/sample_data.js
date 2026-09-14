/**
 * Sample DOM Trees & Mock Test Screenshots for Perception Engineer (Person A)
 */

const sampleData = {
  loginForm: {
    title: "User Portal Login with PII",
    screenshotBase64: "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='800' height='600' style='background:%230f172a;'><rect x='200' y='100' width='400' height='400' rx='12' fill='%231e293b'/><text x='400' y='150' fill='%23f8fafc' font-family='sans-serif' font-size='20' text-anchor='middle'>Secure Portal Sign-In</text><rect x='240' y='190' width='320' height='40' rx='6' fill='%23334155'/><text x='250' y='215' fill='%2394a3b8' font-family='sans-serif' font-size='14'>email@domain.com</text><rect x='240' y='260' width='320' height='40' rx='6' fill='%23334155'/><text x='250' y='285' fill='%2394a3b8' font-family='sans-serif' font-size='14'>••••••••••••</text><rect x='240' y='330' width='320' height='40' rx='6' fill='%23334155'/><text x='250' y='355' fill='%2394a3b8' font-family='sans-serif' font-size='14'>Aadhaar: 5491-2304-9812</text><rect x='240' y='400' width='320' height='44' rx='6' fill='%233b82f6'/><text x='400' y='427' fill='%23ffffff' font-family='sans-serif' font-size='16' font-weight='bold' text-anchor='middle'>Login Now</text></svg>",
    domTree: {
      tagName: "BODY",
      rect: { x: 0, y: 0, width: 800, height: 600 },
      children: [
        {
          id: "card_container",
          tagName: "DIV",
          rect: { x: 200, y: 100, width: 400, height: 400 },
          children: [
            {
              id: "heading_title",
              tagName: "H2",
              text: "Secure Portal Sign-In",
              rect: { x: 200, y: 120, width: 400, height: 40 }
            },
            {
              id: "user_email",
              tagName: "INPUT",
              attributes: { type: "email", id: "user_email", name: "email", autocomplete: "email", placeholder: "Enter user email" },
              text: "john.doe@example.com",
              rect: { x: 240, y: 190, width: 320, height: 40 }
            },
            {
              id: "user_password",
              tagName: "INPUT",
              attributes: { type: "password", id: "user_password", name: "pwd", autocomplete: "current-password" },
              text: "MySecretPassword123!",
              rect: { x: 240, y: 260, width: 320, height: 40 }
            },
            {
              id: "user_aadhaar",
              tagName: "INPUT",
              attributes: { type: "text", id: "user_aadhaar_no", name: "aadhaar", placeholder: "Aadhaar Card Number" },
              text: "5491 2304 9812",
              rect: { x: 240, y: 330, width: 320, height: 40 }
            },
            {
              id: "btn_login",
              tagName: "BUTTON",
              attributes: { id: "btn_login", type: "submit", class: "btn-primary" },
              text: "Login Now",
              rect: { x: 240, y: 400, width: 320, height: 44 }
            }
          ]
        }
      ]
    }
  },
  checkoutForm: {
    title: "E-Commerce Payment & Personal Info",
    screenshotBase64: "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='800' height='600' style='background:%23020617;'><rect x='100' y='50' width='600' height='500' rx='12' fill='%230f172a'/><text x='400' y='90' fill='%23f8fafc' font-family='sans-serif' font-size='22' text-anchor='middle'>Payment & Billing Details</text><rect x='140' y='140' width='240' height='40' rx='6' fill='%231e293b'/><text x='150' y='165' fill='%23cbd5e1' font-family='sans-serif' font-size='14'>Phone: +91 9876543210</text><rect x='420' y='140' width='240' height='40' rx='6' fill='%231e293b'/><text x='430' y='165' fill='%23cbd5e1' font-family='sans-serif' font-size='14'>PAN: ABCDE1234F</text><rect x='140' y='220' width='520' height='40' rx='6' fill='%231e293b'/><text x='150' y='245' fill='%23cbd5e1' font-family='sans-serif' font-size='14'>Card: 4532-8910-4421-9081</text><rect x='140' y='300' width='240' height='40' rx='6' fill='%231e293b'/><text x='150' y='325' fill='%23cbd5e1' font-family='sans-serif' font-size='14'>CVV: 892</text><rect x='420' y='300' width='240' height='40' rx='6' fill='%231e293b'/><text x='430' y='325' fill='%23cbd5e1' font-family='sans-serif' font-size='14'>Expiry: 12/28</text><rect x='140' y='420' width='520' height='50' rx='8' fill='%2322c55e'/><text x='400' y='452' fill='%23ffffff' font-family='sans-serif' font-size='18' font-weight='bold' text-anchor='middle'>Pay $149.99</text></svg>",
    domTree: {
      tagName: "BODY",
      rect: { x: 0, y: 0, width: 800, height: 600 },
      children: [
        {
          id: "checkout_box",
          tagName: "DIV",
          rect: { x: 100, y: 50, width: 600, height: 500 },
          children: [
            {
              id: "phone_num",
              tagName: "INPUT",
              attributes: { type: "tel", id: "phone_num", autocomplete: "tel" },
              text: "+91 98765 43210",
              rect: { x: 140, y: 140, width: 240, height: 40 }
            },
            {
              id: "pan_card",
              tagName: "INPUT",
              attributes: { type: "text", id: "pan_card", name: "pan_number", placeholder: "PAN Number" },
              text: "ABCDE1234F",
              rect: { x: 420, y: 140, width: 240, height: 40 }
            },
            {
              id: "credit_card",
              tagName: "INPUT",
              attributes: { type: "text", id: "card_num", autocomplete: "cc-number" },
              text: "4532 8910 4421 9081",
              rect: { x: 140, y: 220, width: 520, height: 40 }
            },
            {
              id: "card_cvv",
              tagName: "INPUT",
              attributes: { type: "password", id: "cvv_code", autocomplete: "cc-csc" },
              text: "892",
              rect: { x: 140, y: 300, width: 240, height: 40 }
            },
            {
              id: "card_exp",
              tagName: "INPUT",
              attributes: { type: "text", id: "card_exp", autocomplete: "cc-exp" },
              text: "12/28",
              rect: { x: 420, y: 300, width: 240, height: 40 }
            },
            {
              id: "btn_pay",
              tagName: "BUTTON",
              attributes: { id: "btn_pay", class: "checkout-btn" },
              text: "Pay $149.99",
              rect: { x: 140, y: 420, width: 520, height: 50 }
            }
          ]
        }
      ]
    }
  }
};

if (typeof window !== 'undefined') {
  window.PERCEPTION_SAMPLE_DATA = sampleData;
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { PERCEPTION_SAMPLE_DATA: sampleData };
}
