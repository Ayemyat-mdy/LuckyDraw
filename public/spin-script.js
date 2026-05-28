let isSpinning = false;
let currentRotation = 0;

// ======================================================================
// REFRESH PROTECTION LOGIC
// ======================================================================
document.addEventListener("DOMContentLoaded", () => {
    // 💡 အကယ်၍ အရင်က Login မဝင်ရသေးရင် login.html သို့ တိုက်ရိုက်မောင်းထုတ်ရန်
    const loginUser = JSON.parse(localStorage.getItem("user")) || null;
    if (!loginUser) {
        //  window.location.href = "login.html";
        return;
    }

    // 💡 [ပြင်ဆင်ချက်] လက်ရှိ Login ဝင်ထားတဲ့ Session Name ကို ယူမယ်
    const currentSession = localStorage.getItem("sessionName");
    // ဆုပေါက်စဉ်က ဘယ် Session လဲဆိုတာကို မှတ်ထားဖို့ Key အသစ်တစ်ခုနဲ့ တွဲစစ်ပါမယ်
    const prizeSession = localStorage.getItem("pendingPrizeSession");

    const pendingPrize = localStorage.getItem("pendingPrizeName");
    if (pendingPrize) {
        // အကယ်၍ အရင်က ပေါက်ထားတာရှိပြီး OK မနှိပ်ရသေးဘဲ Refresh ဖြစ်သွားပါက Popup ကို ပြန်ဖွင့်ပေးမည်
        showCustomPopup(pendingPrize);
    }
    else if (pendingPrize && currentSession !== prizeSession) {
        // အကယ်၍ Session မတူတော့ရင် ဆုဟောင်းကြီး ဖြစ်နေလို့ ဖျက်ထုတ်ပစ်မယ်
        localStorage.removeItem("pendingPrizeName");
        //localStorage.removeItem("pendingPrizeSession");
    }
});

// Popup ကို လှမ်းပြမည့် Function
function showCustomPopup(prizeName) {
    document.getElementById("popupPrizeName").innerText = prizeName;
    document.getElementById("prizePopup").classList.add("show");
}

// OK နှိပ်ပြီး Popup ပိတ်မည့် Function
function closePopup() {
    document.getElementById("prizePopup").classList.remove("show");

    // ၁။ နိုင်ပြီးကြောင်းမှတ်သားခြင်း
    localStorage.setItem("need_stamp", "true");
    //💡[ပြင်ဆင်ချက်] ပေါက်ပြီးသား ဆုဟောင်းဒေတာကို စက်ထဲက အပြီးဖျက်ထုတ်ပစ်ရန်
    localStorage.removeItem("pendingPrizeName");

    // ၂။ Login ပြန်ဝင်ခိုင်းမယ့်အစား Home သို့ ပြန်ပို့ခြင်း
    window.location.href = "home.html";
}

// 💡 ကစားသမား အဟောင်းဒေတာများကို ဖျက်ပြီး Login သို့ ပို့ပေးမည့် Function
function clearUserDataAndRedirect() {
    // LocalStorage ထဲက လက်ရှိ Player Data များနှင့် Session ID များကို ဖျက်ဆီးပစ်ခြင်း
   // localStorage.removeItem("user");
    //localStorage.removeItem("currentSessionId");
    //localStorage.removeItem("pendingPrizeName");

    localStorage.clear();
    // SessionStorage သုံးထားခဲ့ရင်လည်း အကုန်ရှင်းထုတ်ခြင်း
    sessionStorage.clear();

    // ကစားသမားအသစ်အနေနဲ့ ဝင်ရောက်နိုင်ရန် login.html သို့ လွှဲပြောင်းပေးခြင်း
    window.location.href = "login.html";
}

function startSpin() {
    if (isSpinning) return;

 //   const spinBtn = document.getElementById('spinBtn');
 //   const wheel = document.getElementById('wheel');

    // 💡 LocalStorage ထဲကနေ လက်ရှိ Login ဝင်ထားတဲ့ User ID နဲ့ Session ID ကို ဆွဲထုတ်ယူခြင်း
 //   const loginUser = JSON.parse(localStorage.getItem("user")) || {};
 //   const userId = loginUser.id || loginUser.userid;
  //  const sessionId = localStorage.getItem("sessionName");
   // console.log(`Session ID in spin-script:${sessionId}`);

   const spinBtn = document.getElementById('spinBtn');
    const wheel = document.getElementById('wheel');

    // 💡 LocalStorage ထဲကနေ လက်ရှိ Login ဝင်ထားတဲ့ User ID နဲ့ Session ID ကို ဆွဲထုတ်ယူခြင်း
    const loginUser = JSON.parse(localStorage.getItem("user")) || {};
    
    // ပြဿနာတစ်ခုက အရှေ့ Login Form က 'winner_userid' ဆိုပြီး သိမ်းခဲ့တာဖြစ်လို့ နှစ်ခုလုံးကို စစ်ထုတ်ပါမယ်
    const userId = loginUser.id || loginUser.userid || localStorage.getItem("winner_userid");
    const sessionId = localStorage.getItem("sessionName");
    
    console.log(`User ID for spinning: ${userId}`);
    console.log(`Session ID in spin-script: ${sessionId}`);
    // အကယ်၍ User ID မရှိရင် လှည့်ခွင့်မပေးဘဲ တားဆီးရန်
    if (!userId) {
        alert("ကျေးဇူးပြု၍ အရင်ဆုံး Login ဝင်ပေးပါ!");
        window.location.href = "login.html";
        return;
    }

    isSpinning = true;
    spinBtn.disabled = true;

    // 🌐 FIXED: Changed to relative route '/api/spin'
    fetch('/api/spin', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json' // 👈 JSON ပို့မယ်လို့ ဆာဗာကို အသိပေးခြင်း
        },
        body: JSON.stringify({
            userid: userId,
            sessionid: sessionId
        })
    })
        .then(response => {
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            return response.json();
        })
        .then(data => {
            if (data.status === 'error') {
                alert(data.message);
                isSpinning = false;
                spinBtn.disabled = false;
                return;
            }

            if (data.status === 'empty') {
                alert(data.message);
                spinBtn.innerText = "ကုန်ပါပြီ";
                isSpinning = false;
                return;
            }

            if (data.status === 'success') {
                const targetPrizeId = data.prizeid;
                const degreesPerSegment = 72;

                const targetCenterDegree = (targetPrizeId * degreesPerSegment) - (degreesPerSegment / 2);
                const stopDegree = (360 - targetCenterDegree) % 360;
                const extraRounds = 3600;

                currentRotation += extraRounds + stopDegree - (currentRotation % 360);
                wheel.style.transform = `rotate(${currentRotation}deg)`;

                // မတော်တဆ Refresh ဖြစ်သွားရင် ဆုမဲပြန်ပြနိုင်ရန် ယာယီသိမ်းခြင်း
                localStorage.setItem("pendingPrizeName", data.prizename);

                // 💡 [ဖြည့်စွက်ရန်] ဘယ် Session မှာ ပေါက်ခဲ့လဲဆိုတာကိုပါ စက်ထဲမှာ မှတ်ခိုင်းလိုက်ခြင်း
                localStorage.setItem("pendingPrizeSession", sessionId);

                setTimeout(() => {
                    isSpinning = false;
                    spinBtn.disabled = false;

                    // ဆုမဲပေါက်ကြောင်း Custom Popup ပြသခြင်း
                    showCustomPopup(data.prizename);
                }, 5000);
            }
        })
        .catch(error => {
            console.error("Error during spin:", error);
            alert("ဆာဗာချိတ်ဆက်မှု ပြတ်တောက်နေပါသည်");
            isSpinning = false;
            spinBtn.disabled = false;
        });
}