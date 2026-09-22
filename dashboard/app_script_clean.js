
(function () {
  "use strict";

  var STORAGE_KEY = "ahj_realestate_dashboard_v1";
  var DRIVE_SERVER = "Google Drive";
  var DRIVE_SNAPSHOT_TITLE = "ahj_dashboard_snapshot.json";
  // 2026-09-16: 스냅샷이 1MB 를 넘자(9/11 에 이미 1,017KB) Drive 호출이 전부 실패해 9/11 이후 저장이 0건이었다.
  // 아티팩트→커넥터 호출은 1MB 근처가 한계다. 그래서 gzip 으로 압축해 base64 로 올린다(1MB → 200KB 안팎).
  // 파일 이름은 .json.gz 로 구분하고, 받을 때는 이름과 상관없이 첫 두 바이트(1f 8b)로 gzip 인지 판단한다.
  // 예전 .json 스냅샷도 그대로 읽힌다. 루틴 스크립트(scripts/*.py 의 load_snapshot)도 같은 규칙으로 읽는다.
  var DRIVE_SNAPSHOT_TITLE_GZ = "ahj_dashboard_snapshot.json.gz";
  var DRIVE_SNAPSHOT_QUERY = "(title = '" + DRIVE_SNAPSHOT_TITLE + "' or title = '" + DRIVE_SNAPSHOT_TITLE_GZ + "')";
  var DRIVE_FOLDER_TITLE = "안효준 대시보드 백업";
  var DRIVE_BANK_CHUNK_PREFIX = "ahj_bank_chunk_";
  var DRIVE_STUDENTDB_CHUNK_PREFIX = "ahj_studentdb_chunk_";
  var DRIVE_STUDENTDB_ADD_CHUNK_PREFIX = "ahj_studentdb_add_chunk_";
  var DRIVE_BLOG_TRASH_CHUNK_PREFIX = "ahj_blog_trash_chunk_";
  var DRIVE_BLOG_CHUNK_PREFIX = "ahj_blog_chunk_";
  var DRIVE_MARKET_CHUNK_PREFIX = "ahj_market_chunk_";
  var DRIVE_CAROUSEL_CHUNK_PREFIX = "ahj_carousel_chunk_";
  var DRIVE_MARKET_RESEARCH_CHUNK_PREFIX = "ahj_marketresearch_chunk_";
  var DRIVE_CONTENT_IDEA_CHUNK_PREFIX = "ahj_contentidea_chunk_";
  var DRIVE_BRAND_STRATEGY_CHUNK_PREFIX = "ahj_brandstrategy_chunk_";
  var DRIVE_BLOG_REVISION_CHUNK_PREFIX = "ahj_blog_revision_chunk_";
  var DRIVE_BANK_ADDITION_CHUNK_PREFIX = "ahj_bank_addition_chunk_";
  var DRIVE_LOAN_CONSULTANT_CHUNK_PREFIX = "ahj_loan_consultant_chunk_";
  var DRIVE_STUDENT_TUITION_PATCH_CHUNK_PREFIX = "ahj_student_tuition_patch_chunk_";
  var DRIVE_COURSE_START_PATCH_CHUNK_PREFIX = "ahj_course_start_patch_chunk_";
  var DRIVE_STUDENT_ADD_CHUNK_PREFIX = "ahj_student_add_chunk_";
  var DRIVE_PATCH_CHUNK_PREFIX = "ahj_patch_chunk_";
  var DRIVE_KPI_LOG_CHUNK_PREFIX = "ahj_kpi_log_chunk_";
  var DRIVE_BANK_CATEGORY_PATCH_CHUNK_PREFIX = "ahj_bank_category_patch_chunk_";
  var DRIVE_STUDENT_DELETE_CHUNK_PREFIX = "ahj_student_delete_chunk_";
  var DRIVE_BANK_CATEGORY_OVERRIDE_CHUNK_PREFIX = "ahj_bank_category_override_chunk_";
  var DRIVE_INSTALLMENT_ADDITION_CHUNK_PREFIX = "ahj_installment_addition_chunk_";
  var DRIVE_REVENUE_UNCONFIRM_CHUNK_PREFIX = "ahj_revenue_unconfirm_chunk_";
  var DRIVE_REVENUE_RECONFIRM_CHUNK_PREFIX = "ahj_revenue_reconfirm_chunk_";
  var DRIVE_REVENUE_LINK_FIX_CHUNK_PREFIX = "ahj_revenue_link_fix_chunk_";
  var driveSyncBusy = false;
  var driveSaveSnapshotPending = false; // driveSaveSnapshot()가 busy 상태라 무시된 경우, 잠금이 풀리자마자 한 번 더 저장하기 위한 플래그
  var driveFolderIdPromise = null;
  var cloudAutoSaveTimer = null;
  var cloudSyncState = "idle"; // idle | syncing | synced | offline | error
  var CLOUD_AUTO_SAVE_DEBOUNCE_MS = 10000;
  var CLOUD_AUTO_PULL_INTERVAL_MS = 180000;

  var EXTERNAL_TOOL_URL = "https://claude.ai/code/artifact/e6e3bb90-f77b-48af-aa80-3560d882ae4c";
  // 주택관리는 이 대시보드가 아니라 별도 아티팩트에서 굴린다. 데이터는 안 가져오고 길만 열어 둔다.
  var HOUSING_TOOL_URL = "https://claude.ai/artifact/SzpTKGX8aSEseNivq6ifXU";
  // 사이드바는 대리님이 업무를 나누는 단위(학원·수강생 / 매출·회계 / 경매·컨설팅 / 블로그·마케팅 / 시스템)로 묶는다.
  // short 는 위쪽 가로 메뉴바에서 쓰는 짧은 이름. 휴대폰 서랍 메뉴에서는 label 을 그대로 쓴다.
  var VIEWS = [
    { id: "home", label: "홈", icon: iconHome },
    { id: "studentDb", label: "수강생 DB · 문의", short: "수강생 DB", icon: iconUsers, section: "🏫 학원 · 수강생" },
    { id: "students", label: "수강생 · 매출", short: "수강생·매출", icon: iconChart, section: "🏫 학원 · 수강생" },
    { id: "bank", label: "은행 거래내역 · 회계", short: "은행·회계", icon: iconLedger, section: "💰 매출 · 회계" },
    { id: "auctions", label: "경매·컨설팅·대출상담", short: "경매·컨설팅", icon: iconGavel, section: "🏛 경매 · 컨설팅" },
    { id: "marketAuction", label: "데일리 경매분석", short: "데일리 경매분석", icon: iconChart, section: "🏛 경매 · 컨설팅" },
    { id: "loanConsultants", label: "대출상담사 DB", short: "대출상담사", icon: iconUsers, section: "🏛 경매 · 컨설팅" },
    { id: "caselaw", label: "대법원판례", short: "판례", icon: iconArchive, section: "🏛 경매 · 컨설팅" },
    { id: "auctionMap", label: "전국 경매 물건 현황판 ↗", short: "현황판 ↗", icon: iconSearch, section: "🏛 경매 · 컨설팅", external: EXTERNAL_TOOL_URL },
    { id: "housing", label: "옆커폰 주택관리 현황 ↗", short: "주택관리 ↗", icon: iconHome, section: "🏠 주택관리", external: HOUSING_TOOL_URL },
    { id: "blog", label: "블로그 글 · 발행 관리", short: "블로그 글", icon: iconBlog, section: "✍️ 블로그 · 마케팅" },
    { id: "team", label: "효제이 AI직원팀", short: "AI직원팀", icon: iconTeam, section: "✍️ 블로그 · 마케팅" },
    { id: "workReports", label: "업무보고서 · 일지", short: "업무일지", icon: iconArchive, section: "⚙️ 시스템" },
    { id: "backup", label: "데이터 백업 · 공유", short: "백업", icon: iconCloud, section: "⚙️ 시스템" }
  ];
  function navLabelHtml(v) {
    return '<span class="nv-full">' + esc(v.label) + "</span>" +
      '<span class="nv-short">' + esc(v.short || v.label) + "</span>";
  }

  var BLOG_STATUS = ["아이디어", "정보검수중", "작성중", "SEO검수중", "발행대기", "발행완료", "보류"];
  var BLOG_STATUS_PILL = {
    "아이디어": "neutral", "정보검수중": "accent", "작성중": "warn", "SEO검수중": "brand",
    "발행대기": "brand", "발행완료": "good", "보류": "danger"
  };
  // 블로그 소재가 거치는 5단계 AI 직원 파이프라인. 각 직원이 담당하는 완료 상태(ownsStatus)를 맡아
  // 처리하고, 다음 단계로 넘기거나(보류 직원의 경우) 보류 처리 + 사유를 남긴다.
  var BLOG_PIPELINE_EMPLOYEES = [
    { icon: "🔎", name: "시장조사담당", ownsStatus: "아이디어", desc: "최신 뉴스·시황·실전팁을 조사해 블로그 소재를 발굴합니다" },
    { icon: "💡", name: "콘텐츠기획담당", ownsStatus: "정보검수중", desc: "아이디어에 담긴 통계·사실관계가 출처와 일치하는지 검증합니다" },
    { icon: "📝", name: "블로그제작담당", ownsStatus: "작성중", desc: "검증된 소재로 블로그 본문을 작성합니다" },
    { icon: "🕵️", name: "검수담당", ownsStatus: "SEO검수중", desc: "블로그 작성 스킬 기준(제목·키워드·메타디스크립션 등 SEO 형식)대로 만들어졌는지 검수합니다" },
    { icon: "✅", name: "승인담당", ownsStatus: "보류", desc: "기준에 못 미치면 보류시키고 사유를 남깁니다. 통과 항목은 발행대기로 올려 안효준 대리의 최종 승인을 받습니다" }
  ];
  var BLOG_DAILY_GOAL = 2;

  // 시장조사 · 콘텐츠아이디어 · 검수함 · 승인함 · 블로그 5개 업무 영역을 하나의 "효제이 AI직원팀" 로스터로 묶는다.
  // 카드를 누르면 담당 직원의 개인 업무 페이지(기존 render 함수를 그대로 재사용)로 이동한다.
  var AI_TEAM_MEMBERS = [
    { id: "research", icon: "🔎", name: "시장조사 담당", desc: "지역 시황·경쟁 매물·강의자료용 리서치와, 블로그 소재(뉴스·시황·팁) 발굴(아이디어 단계)을 함께 담당합니다" },
    { id: "content", icon: "💡", name: "콘텐츠기획 담당", desc: "블로그 외 콘텐츠 소재 기획과, 블로그 아이디어의 사실관계 검증(정보검수 단계)을 함께 담당합니다" },
    { id: "review", icon: "🕵️", name: "검수 담당", desc: "시장조사·콘텐츠 아이디어 결과물 검수와, 블로그 스킬 기준 충족 여부(SEO검수 단계)를 함께 담당합니다" },
    { id: "approval", icon: "✅", name: "승인 담당", desc: "검수를 통과한 항목의 최종 승인과, 블로그 최종검토(기준 미달 시 보류+사유)를 함께 담당합니다" },
    { id: "blog", icon: "📝", name: "블로그제작 담당", desc: "검증된 소재로 블로그 본문을 실제로 작성합니다" },
    { id: "carousel", icon: "🎨", name: "이미지구성팀 담당", desc: "콘텐츠기획팀 항목이 승인(완료)되면 인스타그램 캐러셀 초안을 만듭니다" },
    { id: "brand", icon: "🧭", name: "브랜드전략 담당", desc: "매주 대구 경쟁 경매교육 업체를 조사해 차별화 소재를 도출합니다" }
  ];

  // AI_COMPANY_옆커폰부동산에듀.md 방법론 문서의 12개 부서를, 블로그 5단계를 흡수한
  // 효제이 AI직원팀 5개 담당(시장조사·콘텐츠기획·검수·승인·블로그제작) 구조에 매핑한 표.
  // 담당(owner)이 없는 부서는 아직 스킬로 만들지 않은 확장 후보다.
  var AI_TEAM_DEPT_MAP = [
    { n: 1, name: "키워드 조사팀", owner: "🔎 시장조사 담당" },
    { n: 2, name: "자료 수집팀", owner: "💡 콘텐츠기획 담당" },
    { n: 3, name: "사실 검수팀", owner: "💡 콘텐츠기획 담당" },
    { n: 4, name: "콘텐츠 기획팀", owner: "🔎 시장조사 담당" },
    { n: 5, name: "브랜드 전략팀", owner: "🧭 브랜드전략 담당" },
    { n: 6, name: "원고 작성팀", owner: "📝 블로그제작 담당" },
    { n: 7, name: "경험 문장 편집팀", owner: null },
    { n: 8, name: "SEO 편집팀", owner: "🕵️ 검수 담당" },
    { n: 9, name: "이미지 구성팀", owner: "🎨 이미지구성팀 담당" },
    { n: 10, name: "브랜드 검수팀(QA)", owner: "✅ 승인 담당" },
    { n: 11, name: "발행 체크팀", owner: "🕵️ 검수 담당" },
    { n: 12, name: "성과 리뷰팀", owner: null }
  ];
  var AI_TEAM_SAFETY_RULES = [
    "실제 게시·발송·결제는 하지 않고 항상 \"발행대기\" 초안까지만 작성합니다.",
    "ahj_dashboard_snapshot.json 전체 스냅샷은 절대 직접 수정·재업로드하지 않습니다.",
    "확인되지 않은 정보는 사실처럼 쓰지 않고 \"추가 확인 필요\"로 표시합니다.",
    "학생 이름·연락처·매출 등 민감정보는 블로그 파이프라인에서 다루지 않습니다.",
    "최종 발행 권한은 항상 안효준 대리에게 있습니다."
  ];

  function aiTeamOrgInfoHtml() {
    var rows = AI_TEAM_DEPT_MAP.map(function (d) {
      return "<tr><td>" + d.n + "</td><td>" + esc(d.name) + "</td><td>" + (d.owner ? pill(d.owner, "brand") : pill("아직 없음", "neutral")) + "</td></tr>";
    }).join("");
    var html = '<details class="card ai-team-info"><summary>🏢 부서 구성 안내 (12개 부서 ↔ 효제이 AI직원팀 매핑, 안전 규칙)</summary>';
    html += '<div class="ai-team-info-body">';
    html += '<p class="sub">AI_COMPANY 방법론 문서의 12개 부서를, 블로그 5단계(아이디어→정보검수→작성→SEO검수→최종검토)를 흡수한 아래 5개 담당(시장조사·콘텐츠기획·블로그제작·검수·승인) 구조에 매핑한 표입니다.</p>';
    html += '<div class="table-wrap"><table class="data-table"><thead><tr><th>#</th><th>부서</th><th>담당</th></tr></thead><tbody>' + rows + "</tbody></table></div>";
    html += '<div class="ai-team-info-rules"><strong>지켜야 할 안전 규칙</strong><ul>';
    AI_TEAM_SAFETY_RULES.forEach(function (r) { html += "<li>" + esc(r) + "</li>"; });
    html += "</ul></div>";
    html += "</div></details>";
    return html;
  }

  // 오늘 날짜의 blogPosts stageLog 중 stage/by에 keyword가 포함된 가장 최근 항목을 찾는다.
  // (AI 오피스 홈 위젯과 효제이 AI직원팀 카드가 같은 로직을 공유하도록 분리)
  function blogPipelineTodayActivity(keyword) {
    var today = todayStr();
    var todayNote = null, todayAt = null;
    state.blogPosts.forEach(function (p) {
      (p.stageLog || []).forEach(function (entry) {
        if (!entry.at || entry.at.slice(0, 10) !== today) return;
        var hay = (entry.stage || "") + " " + (entry.by || "");
        if (hay.indexOf(keyword) === -1) return;
        if (!todayAt || entry.at > todayAt) { todayAt = entry.at; todayNote = entry.note || ""; }
      });
    });
    return { worked: !!todayAt, note: todayNote };
  }

  function aiTeamMemberStatus(member) {
    var today = todayStr();
    // 블로그 5단계(아이디어/정보검수/작성/SEO검수/최종검토=보류)가 시장조사·콘텐츠기획·블로그제작·검수·승인
    // 5개 담당에게 그대로 겹치므로, 각 담당의 카운트·활동에 해당 블로그 단계 몫을 합산한다.
    if (member.id === "blog") {
      var bCount = state.blogPosts.filter(function (p) { return p.status === "작성중"; }).length;
      var bAct = blogPipelineTodayActivity("작성");
      return { worked: bAct.worked, note: bAct.note, count: bCount };
    }
    if (member.id === "research") {
      var rItems = state.marketResearch.filter(function (r) { return r.status !== "완료"; });
      var rWorked = state.marketResearch.some(function (r) { return (r.updatedAt || r.createdAt || "").slice(0, 10) === today || r.requestedDate === today; });
      var rLatest = state.marketResearch.slice().sort(function (a, b) { return (b.updatedAt || b.createdAt || "").localeCompare(a.updatedAt || a.createdAt || ""); })[0];
      var rBlogCount = state.blogPosts.filter(function (p) { return p.status === "아이디어"; }).length;
      var rBlogAct = blogPipelineTodayActivity("아이디어");
      return {
        worked: rWorked || rBlogAct.worked,
        note: rBlogAct.worked ? rBlogAct.note : (rLatest ? (rLatest.region + " · " + rLatest.topic) : null),
        count: rItems.length + rBlogCount
      };
    }
    if (member.id === "content") {
      var cItems = state.contentIdeas.filter(function (c) { return c.status !== "완료"; });
      var cWorked = state.contentIdeas.some(function (c) { return (c.updatedAt || c.createdAt || "").slice(0, 10) === today; });
      var cLatest = state.contentIdeas.slice().sort(function (a, b) { return (b.updatedAt || b.createdAt || "").localeCompare(a.updatedAt || a.createdAt || ""); })[0];
      var cBlogCount = state.blogPosts.filter(function (p) { return p.status === "정보검수중"; }).length;
      var cBlogAct = blogPipelineTodayActivity("정보검수");
      return {
        worked: cWorked || cBlogAct.worked,
        note: cBlogAct.worked ? cBlogAct.note : (cLatest ? cLatest.title : null),
        count: cItems.length + cBlogCount
      };
    }
    if (member.id === "review") {
      var revItems = workflowInboxItems("검수대기");
      var vBlogCount = state.blogPosts.filter(function (p) { return p.status === "SEO검수중"; }).length;
      var vBlogAct = blogPipelineTodayActivity("SEO");
      return {
        worked: revItems.length > 0 || vBlogAct.worked,
        note: vBlogAct.worked ? vBlogAct.note : (revItems[0] ? revItems[0].title : null),
        count: revItems.length + vBlogCount
      };
    }
    if (member.id === "approval") {
      var apItems = workflowInboxItems("승인대기");
      var aBlogCount = state.blogPosts.filter(function (p) { return p.status === "보류"; }).length;
      var aBlogAct = blogPipelineTodayActivity("최종검토");
      return {
        worked: apItems.length > 0 || aBlogAct.worked,
        note: aBlogAct.worked ? aBlogAct.note : (apItems[0] ? apItems[0].title : null),
        count: apItems.length + aBlogCount
      };
    }
    if (member.id === "carousel") {
      var cwWorked = state.carouselDrafts.some(function (d) { return (d.updatedAt || d.createdAt || "").slice(0, 10) === today; });
      var cwLatest = state.carouselDrafts.slice().sort(function (a, b) { return (b.updatedAt || b.createdAt || "").localeCompare(a.updatedAt || a.createdAt || ""); })[0];
      return { worked: cwWorked, note: cwLatest ? cwLatest.title : null, count: state.carouselDrafts.length };
    }
    if (member.id === "brand") {
      var bsWorked = state.brandStrategyReports.some(function (r) { return (r.updatedAt || r.createdAt || "").slice(0, 10) === today; });
      var bsLatest = state.brandStrategyReports.slice().sort(function (a, b) { return (b.updatedAt || b.createdAt || "").localeCompare(a.updatedAt || a.createdAt || ""); })[0];
      return { worked: bsWorked, note: bsLatest ? ("주차 " + bsLatest.weekOf + " · 경쟁사 " + ((bsLatest.competitors || []).length) + "곳") : null, count: state.brandStrategyReports.length };
    }
    return { worked: false, note: null, count: 0 };
  }

  var CATEGORY_META = {
    edu:     { label: "에듀 교육",     inkVar: "--tag-edu-ink",     bgVar: "--tag-edu-bg" },
    auction: { label: "경매 · 컨설팅", inkVar: "--tag-auction-ink", bgVar: "--tag-auction-bg" },
    ceo:     { label: "대표님 개인업무", inkVar: "--tag-ceo-ink",   bgVar: "--tag-ceo-bg" },
    loan:    { label: "대출상담",       inkVar: "--tag-loan-ink",   bgVar: "--tag-loan-bg" },
    mkt:     { label: "마케팅 · 홍보",  inkVar: "--tag-mkt-ink",    bgVar: "--tag-mkt-bg" },
    doc:     { label: "문서 · 디자인",  inkVar: "--tag-doc-ink",    bgVar: "--tag-doc-bg" },
    admin:   { label: "회계 · 행정",    inkVar: "--tag-admin-ink",  bgVar: "--tag-admin-bg" }
  };
  var CATEGORY_ORDER = ["edu", "auction", "ceo", "loan", "mkt", "doc", "admin"];

  // 출금내역을 대리님이 직접 분류할 수 있도록 하는 지출 분류 체계.
  // 세무 신고 시 바로 참고할 수 있도록 계정과목 명칭을 기본으로 쓴다.
  var EXPENSE_CATEGORIES = ["ceo_personal", "edu_supplies", "edu_utility", "edu_platform", "edu_student_accompany", "edu_advertising", "edu_tax_accountant", "edu_telecom", "edu_rental", "edu_printing", "edu_utilities_bill", "edu_salary", "edu_bank_fee", "edu_welfare", "edu_entertainment", "edu_bid_outsourcing", "edu_vehicle", "edu_tuition_refund", "edu_advance"];
  var EXPENSE_CATEGORY_LABELS = {
    ceo_personal: "대표자 인출금 (개인경비)",
    edu_supplies: "소모품비 (비품지출)",
    edu_utility: "세금과공과 (공과금납부)",
    edu_platform: "지급수수료 (플랫폼·카드단말기결제)",
    edu_student_accompany: "여비교통비 (수강생 동행)",
    edu_advertising: "광고선전비 (광고비)",
    edu_tax_accountant: "지급수수료 (세무 기장료)",
    edu_telecom: "통신비 (인터넷·전화)",
    edu_rental: "임차료 (월세·관리비·정수기·복합기 등)",
    edu_printing: "도서인쇄비 (교재 제본비)",
    edu_utilities_bill: "수도광열비 (전기·가스·수도)",
    edu_salary: "급여 (직원 급여이체)",
    edu_bank_fee: "지급수수료 (은행 수수료)",
    edu_welfare: "복리후생비 (직원 식대 등)",
    edu_entertainment: "접대비 (거래처·외부인 접대)",
    edu_bid_outsourcing: "지급수수료 (타사 대리입찰대행)",
    edu_vehicle: "차량유지비 (업무용 유류비 등)",
    edu_tuition_refund: "매출환입 (수강료 환불)",
    edu_advance: "입체금 (수강생 대납 · 정산예정)"
  };
  var EXPENSE_CATEGORY_PILL = {
    ceo_personal: "neutral",
    edu_supplies: "brand",
    edu_utility: "warn",
    edu_platform: "accent",
    edu_student_accompany: "good",
    edu_advertising: "danger",
    edu_tax_accountant: "neutral",
    edu_telecom: "brand",
    edu_rental: "warn",
    edu_printing: "accent",
    edu_utilities_bill: "warn",
    edu_salary: "good",
    edu_bank_fee: "neutral",
    edu_welfare: "good",
    edu_entertainment: "accent",
    edu_bid_outsourcing: "danger",
    edu_vehicle: "brand",
    edu_tuition_refund: "danger",
    edu_advance: "neutral"
  };
  // 수강생 대납 정산. 임장·회식 때 회사카드로 긁고 수강생이 n분의 1 로 돌려준 돈은 매출도 비용도 아니다
  // (회계상 입체금 → 회수). 입금 분류 "reimburse"(정산입금) 와 지출 분류 "edu_advance"(입체금) 로 표시하고
  // KPI 매출·순이익·홈 순이익에서는 둘 다 뺀다(2026-09-16 대리님 결정). 은행 잔액·거래 건수 자체는 그대로 둔다.
  function isReimburseDeposit(t) { return !!t && t.category === "reimburse" && t.deposit > 0; }
  function isAdvanceSpend(t) { return !!t && t.expenseCategory === "edu_advance" && t.withdrawal > 0; }
  function settlementStats() {
    var map = {};
    state.transactions.forEach(function (t) {
      var r = isReimburseDeposit(t), a = isAdvanceSpend(t);
      if (!r && !a) return;
      var mk = (t.date || "").slice(0, 7);
      if (!map[mk]) map[mk] = { advance: 0, reimburse: 0, advanceCount: 0, reimburseCount: 0 };
      if (a) { map[mk].advance += Number(t.withdrawal) || 0; map[mk].advanceCount++; }
      if (r) { map[mk].reimburse += Number(t.deposit) || 0; map[mk].reimburseCount++; }
    });
    return map;
  }
  // 적요에 특정 키워드가 포함되면 자동으로 이 분류를 적용한다 (대소문자 구분 없이 부분일치).
  // 같은 결제사가 매번 적요 뒤에 다른 코드를 붙이는 경우(예: 페이스북 광고비) 정확히 같은 적요가 아니어도 잡아준다.
  var EXPENSE_KEYWORD_RULES = [
    { keyword: "facebk", category: "edu_advertising" }
  ];

  // 적요가 "카드사이름+정산코드숫자" 형태면 카드사 매입 정산 입금으로 보고, 현금영수증 발행이 필요없는
  // 카드결제로 자동 표시한다 (예: 롯데9927821022, 신한0142334416, KB12105192, 삼성20317813).
  var CARD_SETTLEMENT_PATTERN = /^(롯데|신한|KB|국민|삼성|현대|하나|우리|비씨|BC|NH|농협)\d{5,}$/i;

  var STUDENT_LEVELS = ["초급반", "중급반", "고급반(오프라인)", "고급반(온라인)", "낙찰반", "컨설팅반"];
  var STUDENT_STATUS = ["상담중", "방문예정", "등록완료", "보류"];
  var STUDENT_STATUS_PILL = { "상담중": "neutral", "방문예정": "warn", "등록완료": "good", "보류": "danger" };
  var PAYMENT_TYPES = ["단발성", "월별"];
  var MONTHLY_LEVELS = { "고급반(오프라인)": true, "고급반(온라인)": true, "낙찰반": true };
  var FIXED_COURSE_WEEKS = { "초급반": 5, "중급반": 5 }; // 5주 완성 과정 - 신청일 기준 종료 예정일을 계산한다

  var AUCTION_STAGES = ["물건조사", "입찰준비", "입찰완료", "낙찰", "패찰", "대출진행", "명도", "잔금완료"];
  var AUCTION_STAGE_PILL = {
    "물건조사": "neutral", "입찰준비": "neutral", "입찰완료": "warn", "낙찰": "brand",
    "패찰": "danger", "대출진행": "warn", "명도": "warn", "잔금완료": "good"
  };
  var AUCTION_ACTIVE_STAGES = ["물건조사", "입찰준비", "입찰완료", "낙찰", "대출진행", "명도"];
  var AD_SPEND_KEYWORDS = ["FACEBK", "네이버파이낸셜"];

  var MARKET_PROPERTY_TYPES = ["아파트", "오피스텔", "다세대·연립", "단독·다가구", "상가", "토지", "공장", "기타"];
  // "매각" 은 현황판이 "남이 낙찰받았다"는 뜻으로 쓰는 중간 상태다. 목록에 없으면
  // 상태 드롭다운이 이 값을 표현하지 못해 첫 항목(조사중)으로 보이고, 그대로 저장하면
  // 실제 상태가 조용히 조사중으로 뒤집힌다. 그래서 정식 상태로 넣는다.
  // 낙찰가까지 확인되면 07시 루틴이 매각종료로 올린다.
  var MARKET_STATUS = ["조사중", "입찰예정", "유찰", "매각", "낙찰", "패찰", "매각종료", "변경", "취하"];
  var MARKET_STATUS_PILL = { "조사중": "neutral", "입찰예정": "warn", "유찰": "danger", "매각": "neutral", "낙찰": "good", "패찰": "neutral", "변경": "accent", "취하": "neutral", "매각종료": "neutral" };
  var MARKET_ACTIVE_STATUS = { "조사중": true, "입찰예정": true, "유찰": true };
  var MARKET_STATUS_DIMMED = { "낙찰": true, "매각": true, "변경": true, "취하": true, "매각종료": true };
  var MARKET_STATUS_DIMMED_STRONG = { "변경": true, "취하": true, "매각종료": true };
  var MARKET_TYPE_PILL = {
    "아파트": "brand", "오피스텔": "accent", "상가": "warn", "토지": "good",
    "공장": "neutral", "다세대·연립": "neutral", "단독·다가구": "neutral", "기타": "neutral"
  };

  // 법원별 유찰(저감)율표 — 지역/법원마다 1회 유찰 시 최저매각가를 낮추는 비율이 다르다.
  // branch가 있는 항목이 branch가 없는 본원 항목보다 우선 매칭된다 (marketCourtFailRate 참고).
  // rate가 null인 항목(밀양지원)은 사건마다 저감율(20~30%)이 달라 자동 계산 대상에서 제외한다.
  var MARKET_FAIL_BID_RATE_TABLE = [
    { parent: "서울중앙지방법원", branch: null, rate: 20 },
    { parent: "서울동부지방법원", branch: null, rate: 20 },
    { parent: "서울서부지방법원", branch: null, rate: 20 },
    { parent: "서울남부지방법원", branch: null, rate: 20 },
    { parent: "서울북부지방법원", branch: null, rate: 20 },
    { parent: "의정부지방법원", branch: "고양지원", rate: 30 },
    { parent: "의정부지방법원", branch: "남양주지원", rate: 30 },
    { parent: "의정부지방법원", branch: null, rate: 30 },
    { parent: "인천지방법원", branch: "부천지원", rate: 30 },
    { parent: "인천지방법원", branch: null, rate: 30 },
    { parent: "수원지방법원", branch: "성남지원", rate: 30 },
    { parent: "수원지방법원", branch: "여주지원", rate: 30 },
    { parent: "수원지방법원", branch: "평택지원", rate: 30 },
    { parent: "수원지방법원", branch: "안산지원", rate: 30 },
    { parent: "수원지방법원", branch: "안양지원", rate: 20 },
    { parent: "수원지방법원", branch: null, rate: 30 },
    { parent: "대전지방법원", branch: "천안지원", rate: 30 },
    { parent: "대전지방법원", branch: "공주지원", rate: 30 },
    { parent: "대전지방법원", branch: "서산지원", rate: 30 },
    { parent: "대전지방법원", branch: "홍성지원", rate: 30 },
    { parent: "대전지방법원", branch: "논산지원", rate: 30 },
    { parent: "대전지방법원", branch: null, rate: 30 },
    { parent: "청주지방법원", branch: "충주지원", rate: 20 },
    { parent: "청주지방법원", branch: "제천지원", rate: 20 },
    { parent: "청주지방법원", branch: "영동지원", rate: 20 },
    { parent: "청주지방법원", branch: null, rate: 30 },
    { parent: "춘천지방법원", branch: "원주지원", rate: 30 },
    { parent: "춘천지방법원", branch: "강릉지원", rate: 30 },
    { parent: "춘천지방법원", branch: "속초지원", rate: 30 },
    { parent: "춘천지방법원", branch: "영월지원", rate: 30 },
    { parent: "춘천지방법원", branch: null, rate: 30 },
    { parent: "부산지방법원", branch: "동부지원", rate: 20 },
    { parent: "부산지방법원", branch: "서부지원", rate: 20 },
    { parent: "부산지방법원", branch: null, rate: 20 },
    { parent: "울산지방법원", branch: null, rate: 30 },
    { parent: "창원지방법원", branch: "통영지원", rate: 20 },
    { parent: "창원지방법원", branch: "거창지원", rate: 20 },
    { parent: "창원지방법원", branch: "밀양지원", rate: null },
    { parent: "창원지방법원", branch: "진주지원", rate: 20 },
    { parent: "창원지방법원", branch: "마산지원", rate: 20 },
    { parent: "창원지방법원", branch: null, rate: 20 },
    { parent: "대구지방법원", branch: "서부지원", rate: 30 },
    { parent: "대구지방법원", branch: "경주지원", rate: 30 },
    { parent: "대구지방법원", branch: "김천지원", rate: 30 },
    { parent: "대구지방법원", branch: "상주지원", rate: 30 },
    { parent: "대구지방법원", branch: "의성지원", rate: 30 },
    { parent: "대구지방법원", branch: "영덕지원", rate: 30 },
    { parent: "대구지방법원", branch: "안동지원", rate: 30 },
    { parent: "대구지방법원", branch: "포항지원", rate: 30 },
    { parent: "대구지방법원", branch: null, rate: 30 },
    { parent: "광주지방법원", branch: "목포지원", rate: 30 },
    { parent: "광주지방법원", branch: "순천지원", rate: 30 },
    { parent: "광주지방법원", branch: "해남지원", rate: 30 },
    { parent: "광주지방법원", branch: "장흥지원", rate: 20 },
    { parent: "광주지방법원", branch: null, rate: 30 },
    { parent: "전주지방법원", branch: "남원지원", rate: 30 },
    { parent: "전주지방법원", branch: "군산지원", rate: 30 },
    { parent: "전주지방법원", branch: "정읍지원", rate: 30 },
    { parent: "전주지방법원", branch: null, rate: 30 },
    { parent: "제주지방법원", branch: null, rate: 30 }
  ];
  function normalizeCourtStr(s) {
    return (s || "").replace(/\s+/g, "").replace(/지방법원/g, "지법");
  }
  // "대구지방법원"/"대구지법"/"대구" 등 표기가 달라도 같은 법원으로 인식하도록, "지방법원" 접미사를 뗀
  // 지역 어근(예: 대구, 서울중앙, 수원)만으로 매칭한다. 어근+지원명이 함께 있는지만 확인하면 되므로
  // "대구서부지원"처럼 "지방법원"을 아예 안 쓴 표기도 "대구지방법원 서부지원"과 동일하게 인식된다.
  function marketFailBidCourtRoot(parentName) {
    return normalizeCourtStr((parentName || "").replace(/지방법원$/, ""));
  }
  function marketCourtFailRate(courtRaw) {
    var input = normalizeCourtStr(courtRaw);
    if (!input) return null;
    var branchMatches = MARKET_FAIL_BID_RATE_TABLE.filter(function (e) {
      return e.branch && input.indexOf(marketFailBidCourtRoot(e.parent)) !== -1 && input.indexOf(normalizeCourtStr(e.branch)) !== -1;
    });
    if (branchMatches.length) {
      var b = branchMatches[0];
      return { rate: b.rate, matchedName: b.parent + " " + b.branch };
    }
    var parentMatches = MARKET_FAIL_BID_RATE_TABLE.filter(function (e) {
      return !e.branch && input.indexOf(marketFailBidCourtRoot(e.parent)) !== -1;
    });
    if (parentMatches.length) {
      var p = parentMatches[0];
      return { rate: p.rate, matchedName: p.parent };
    }
    return null;
  }
  function marketFailBidPreview(m) {
    var info = marketCourtFailRate(m.court);
    if (!info) return { status: "not-found" };
    if (info.rate === null) return { status: "ambiguous", matchedName: info.matchedName };
    var base = m.minSalePrice > 0 ? m.minSalePrice : (m.appraisalValue > 0 ? m.appraisalValue : 0);
    if (!base) return { status: "no-base", matchedName: info.matchedName, rate: info.rate };
    var next = Math.round((base * (1 - info.rate / 100)) / 10000) * 10000;
    return { status: "ok", matchedName: info.matchedName, rate: info.rate, base: base, next: next };
  }
  function marketFailBidFieldHtml(m) {
    var info = marketFailBidPreview(m);
    var html = "";
    if (info.status === "ok") {
      html += '<div class="fail-bid-preview">📉 ' + esc(info.matchedName) + " 유찰저감율 " + info.rate + "% · 다음 유찰 시 예상 최저가 약 " + won(info.next) + "</div>";
      html += '<button type="button" class="btn btn-ghost btn-sm" data-market-fail-bid="' + m.id + '" style="margin-top:6px">🔻 유찰 처리 (' + won(info.next) + '로 자동 갱신)</button>';
    } else if (info.status === "ambiguous") {
      html += '<div class="fail-bid-preview fail-bid-warn">⚠️ ' + esc(info.matchedName) + "은 사건마다 저감율(20~30%)이 달라 자동 계산할 수 없습니다. 매각물건명세서에서 직접 확인해 최저매각가를 입력해주세요.</div>";
    } else if (info.status === "no-base") {
      html += '<div class="fail-bid-preview fail-bid-warn">⚠️ ' + esc(info.matchedName) + " " + info.rate + "% 저감율은 확인했지만, 감정가나 최저매각가가 없어 예상 유찰가를 계산할 수 없습니다.</div>";
    } else {
      html += '<div class="fail-bid-preview fail-bid-warn">⚠️ 이 법원의 유찰저감율 정보를 찾을 수 없습니다. 법원명을 정확히 입력했는지 확인하거나(예: 대구지방법원 포항지원), 최저매각가를 직접 입력해주세요.</div>';
    }
    return html;
  }

  var STUDENT_DB_COURSE_KEYS = ["basic", "intermediate", "regular", "advanced", "consulting", "trial"];
  var STUDENT_DB_COURSE_LABELS = { basic: "초급반", intermediate: "중급반", regular: "정규반", advanced: "고급반", consulting: "컨설팅", trial: "체험단" };
  var STUDENT_DB_COURSE_PILL = { basic: "neutral", intermediate: "brand", regular: "accent", advanced: "warn", consulting: "good", trial: "danger" };
  var STUDENT_DB_COURSE_TYPE_OPTIONS = ["초급반", "중급반", "정규반", "파이널", "월요일 10시", "화요일 10시", "화요일 19시"];
  var STUDENT_DB_CLASS_TIME_OPTIONS = ["10시", "2시", "7시", "주말 10시"];
  var STUDENT_DB_PAYMENT_STATUS_OPTIONS = ["입금완료", "카드결제", "O"];

  var LOAN_STAGES = ["사전확인", "서류준비", "은행전달", "승인", "대출완료"];
  var LOAN_STAGE_PILL = { "사전확인": "neutral", "서류준비": "neutral", "은행전달": "warn", "승인": "brand", "대출완료": "good" };

  // 시장조사 · 콘텐츠 아이디어가 공유하는 업무 흐름: 대기 → 진행중 → 검수대기 → 승인대기 → 완료.
  // 검수함/승인함 탭은 이 두 목록을 가로질러 "검수대기"/"승인대기" 항목만 모아 보여준다.
  var WORKFLOW_STAGES = ["대기", "진행중", "검수대기", "승인대기", "완료"];
  var WORKFLOW_STAGE_PILL = { "대기": "neutral", "진행중": "warn", "검수대기": "accent", "승인대기": "brand", "완료": "good" };
  var MARKET_RESEARCH_PURPOSE = ["경매컨설팅", "블로그소재", "강의자료", "기타"];
  var CONTENT_IDEA_CATEGORY = ["블로그", "강의자료", "SNS", "기타"];
  var PRIORITY_LEVELS = ["높음", "보통", "낮음"];
  var PRIORITY_PILL = { "높음": "danger", "보통": "warn", "낮음": "neutral" };
  var SCHEDULE_TYPES = ["상담", "현장답사", "강의", "기타"];
  var REPORT_PERIODS = ["일간", "주간", "월간"];
  var RESOURCE_CATEGORY = ["양식", "판례", "법령정보", "참고자료", "기타"];

  var WEEKDAY_SCHEDULE = {
    1: { label: "월요일", cls: "중급반" },
    2: { label: "화요일", cls: "초급반" },
    4: { label: "목요일", cls: "고급반 (오전·저녁)" }
  };

  var BANK_HEADER_KEYWORDS = {
    date: ["거래일시", "거래일자", "거래일", "날짜", "일자"],
    description: ["기재내용", "적요", "거래내용", "내용", "입금자", "출금자", "거래구분", "비고", "메모"],
    withdrawal: ["출금액", "지급액", "지급", "출금", "인출"],
    deposit: ["입금액", "입금금액", "예입액", "입금"],
    balance: ["거래후잔액", "잔액"]
  };
  var BANK_ROLE_LABELS = { ignore: "무시", date: "날짜", description: "적요/내용", deposit: "입금액", withdrawal: "출금액", balance: "잔액" };

  var SEED_BLOG_BODY = [
    "메타디스크립션: 2026년 6월 전국 아파트 경매 진행건수가 12년 3개월 만에 최다를 기록한 가운데, 대구 낙찰가율은 한 달 만에 5%포인트 넘게 하락했습니다. 임의경매가 급증하는 이유와 지금 입찰을 고려한다면 확인해야 할 점을 정리했습니다.",
    "안녕하세요. 옆커폰부동산에듀입니다.",
    "최근 부동산 경매 통계 하나가 눈에 띕니다.",
    "바로 전국 아파트 경매 진행건수가 12년 3개월 만에 가장 많은 수준으로 올라왔다는 소식입니다.",
    "그것도 늘어난 것에서 그치지 않고, 대구를 비롯한 지방 아파트 경매의 낙찰가율까지 함께 흔들리고 있다는 점이 더 눈길을 끕니다.",
    "오늘은 최근 발표된 경매 통계를 바탕으로, 지금 경매시장에서 실제로 어떤 일이 벌어지고 있는지 정리해 보겠습니다.",
    "전국 아파트 경매, 왜 12년 만에 최다를 기록했을까요?",
    "2026년 6월 기준 전국 아파트 경매 진행건수는 3,701건으로 집계됐습니다.",
    "전월인 3,204건과 비교하면 한 달 사이 16%가량 늘어난 수치입니다.",
    "이 정도 물량은 2014년 3월 이후, 그러니까 약 12년 3개월 만에 가장 많은 수준이라고 합니다.",
    "경매 진행건수가 늘었다는 것은 그만큼 대출 이자나 원리금을 감당하지 못해 담보가 경매로 넘어가는 부동산이 늘고 있다는 의미이기도 합니다.",
    "같은 기간 전국 낙찰가율은 86.9%로, 지난해 11월 이후 가장 낮은 수준까지 내려왔습니다.",
    "대구 아파트 경매시장은 어떤 상황일까요?",
    "지방 아파트 경매시장 중에서도 대구의 변화 폭이 눈에 띕니다.",
    "2026년 6월 대구 아파트 낙찰가율은 81.1%를 기록했습니다.",
    "전월인 86.6%와 비교하면 한 달 만에 5.5%포인트나 낮아진 수치입니다.",
    "광역시 가운데 낙찰가율 하락 폭이 가장 큰 곳이 대구였습니다.",
    "다만 낙찰률(응찰자가 있어 실제로 낙찰까지 이어진 비율)은 33.5%로, 전국 평균 수준을 나타냈습니다.",
    "즉 응찰 자체가 아예 없는 것은 아니지만, 낙찰가는 감정가에 비해 낮게 형성되는 흐름이 이어지고 있다고 볼 수 있습니다.",
    "경북·강원 등 다른 지역은 어떨까요?",
    "지역별로 보면 온도차가 뚜렷합니다.",
    "경북 아파트 낙찰가율은 2026년 5월 72.8%까지 떨어지며 전월 대비 8.7%포인트 급락했다가, 6월에는 76.8%로 4.0%포인트 반등했습니다.",
    "강원은 6월 기준 71.7%로, 전월 대비 16.3%포인트나 낮아지며 전국에서 가장 큰 낙폭을 보였습니다.",
    "반대로 울산은 94.7%로 전월보다 6.1%포인트 올랐고, 광주와 대전도 81~82%대에서 소폭 상승하는 모습을 보였습니다.",
    "정리하면 지방 안에서도 지역별 편차가 크고, 매달 순위가 바뀔 만큼 변동성이 커진 상태라고 볼 수 있습니다.",
    "임의경매가 급증하는 이유는 무엇일까요?",
    "경매 물건이 늘어나는 배경에는 임의경매 개시 건수 증가가 자리하고 있습니다.",
    "대구의 경우 2026년 1~4월 임의경매 개시 건수가 1,149건으로 집계됐습니다.",
    "이는 2021년 같은 기간과 비교하면 3배 수준이며, 2021년 한 해 전체 건수인 1,147건을 넉 달 만에 넘어선 수치이기도 합니다.",
    "연도별로 보면 대구 임의경매는 2021년 1,147건에서 2022년 1,674건, 2023년 2,678건, 2024년 3,722건까지 꾸준히 늘었고, 2025년에는 3,591건으로 소폭 줄었습니다.",
    "이렇게 정리할 수 있습니다.",
    "금리 상승기 무리한 대출\n→ 이자·원리금 연체 누적(6~12개월)\n→ 임의경매 개시 건수 증가\n→ 경매 물량 적체\n→ 매수 심리 위축\n→ 낙찰가율 하락",
    "전문가들은 경매가 실물경제를 1~2년 정도 늦게 반영하는 후행지표라는 점을 짚습니다.",
    "즉 지금 나오는 경매 물건들은 그만큼 이전 시기의 대출 부담이 뒤늦게 반영된 결과라는 해석입니다.",
    "달서구는 왜 유독 두드러질까요?",
    "대구 안에서도 구별로 온도차가 있습니다.",
    "집합건물(아파트 포함) 임의경매 건수를 구별로 보면, 달서구가 유일하게 300건을 넘긴 304건을 기록했습니다.",
    "가격 흐름도 함께 봐야 합니다.",
    "2022년 고점과 비교했을 때 대구 아파트값은 평균 26.72% 하락한 것으로 나타났는데, 달서구는 이보다 더 큰 31.97% 하락을 기록했습니다.",
    "가격 하락 폭이 큰 지역일수록 담보가치 대비 대출 비중이 높았던 물건에서 경매로 이어질 가능성도 함께 커지는 셈입니다.",
    "서울과 지방의 온도차, 왜 이렇게 벌어졌을까요?",
    "같은 시기 서울 아파트 경매시장은 정반대 흐름을 보였습니다.",
    "2026년 6월 서울 낙찰가율은 101.7%로, 감정가를 웃도는 수준까지 올라왔습니다.",
    "특히 전용 60제곱미터 이하 소형 아파트는 4월 105.1%에서 6월 112.8%까지 오르며, 평균 응찰자 수도 7.2명에 달했습니다.",
    "지방에서는 물건이 쌓이고 낙찰가율이 낮아지는 사이, 서울에서는 오히려 감정가보다 비싸게 낙찰되는 경쟁이 벌어지고 있는 셈입니다.",
    "전문가들은 이러한 수도권과 지방의 온도차가 당분간 이어질 가능성이 크다고 보고 있습니다.",
    "지금 경매에 관심 있다면 무엇을 확인해야 할까요?",
    "낙찰가율이 낮아졌다는 것은 그만큼 상대적으로 저렴하게 낙찰받을 가능성이 커졌다는 뜻이기도 합니다.",
    "다만 낙찰가율 하락에는 이유가 있다는 점도 함께 봐야 합니다.",
    "먼저 해당 지역의 미분양 물량과 향후 입주 예정 물량을 확인해야 합니다.",
    "공급이 계속 쌓이는 지역이라면 낙찰 이후에도 시세 회복까지 시간이 걸릴 수 있습니다.",
    "또한 임의경매로 넘어온 물건이라면 기존 대출·임차인 현황, 선순위 권리관계를 등기부등본과 매각물건명세서로 꼼꼼히 확인해야 합니다.",
    "낙찰가가 낮다고 해서 권리분석까지 간단해지는 것은 아닙니다.",
    "마지막으로 낙찰 이후 명도나 재임대·재매도 시점의 지역 수요도 함께 고려해야 합니다.",
    "같은 지역이라도 구별, 단지별로 편차가 크기 때문에 평균 통계만으로 개별 물건의 가치를 판단하는 것은 위험합니다.",
    "핵심 정리",
    "2026년 6월 전국 아파트 경매 진행건수는 3,701건으로 12년 3개월 만에 최다를 기록했습니다.",
    "대구 낙찰가율은 한 달 만에 5.5%포인트 하락한 81.1%를 기록했고, 대구 임의경매 개시 건수는 1~4월 기준 1,149건으로 2021년 동기 대비 3배 늘었습니다.",
    "반면 서울은 낙찰가율이 감정가를 넘어서는 등 지방과 상반된 흐름을 보이고 있습니다.",
    "지금처럼 지역별 편차가 큰 시기일수록, 평균 통계보다 개별 물건의 권리관계와 시세, 공급 물량을 직접 확인하는 절차가 더 중요합니다.",
    "자주 묻는 질문",
    "낙찰가율이 낮아지면 무조건 저렴하게 살 수 있는 건가요?\n평균 낙찰가율이 낮아졌다고 모든 물건이 저렴한 것은 아닙니다. 개별 물건의 입지, 권리관계, 공급 물량에 따라 편차가 크기 때문에 낙찰가율은 참고 지표로만 활용하는 것이 좋습니다.",
    "임의경매와 강제경매는 어떻게 다른가요?\n임의경매는 근저당권 등 담보권자가 별도의 재판 절차 없이 담보를 실행해 진행하는 경매이고, 강제경매는 채권자가 소송 등을 거쳐 확정판결을 받은 뒤 진행하는 경매입니다. 최근 늘어난 물건은 대부분 임의경매에 해당합니다.",
    "지방 경매 물건이 늘어난 게 지금 매수 기회라는 뜻인가요?\n물량 증가와 낙찰가율 하락이 매수 기회가 될 수는 있지만, 공급 과잉이나 인구 감소 지역이라면 낙찰 이후 시세 회복이 늦어질 수 있습니다. 지역별 수급 상황을 함께 확인해야 합니다.",
    "경매 통계는 어디서 확인할 수 있나요?\n법원경매정보 사이트나 민간 경매정보업체의 월간 통계자료를 통해 지역별 낙찰가율, 낙찰률, 진행건수 등을 확인할 수 있습니다.",
    "이미지 ALT 태그\n전국 아파트 경매 진행건수 12년 만에 최다\n대구 아파트 경매 낙찰가율 하락 그래프\n지역별 아파트 낙찰가율 비교\n임의경매 개시 건수 증가 추이\n서울과 지방 아파트 경매시장 온도차",
    "해시태그\n#아파트경매 #대구경매 #낙찰가율 #임의경매 #부동산경매 #경매물건 #대구부동산 #경북부동산 #부동산투자 #경매공부 #권리분석 #부동산뉴스 #부동산공부 #낙찰전략 #옆커폰부동산에듀"
  ].join("\n\n");

  var state = loadState();
  // 처음 켤 때 기존 거래내역 중 이미 분류된 적요와 같은 미분류 출금건이 있으면 한 번 자동으로 채워준다.
  var __initExpenseChanged = autoClassifyExpenseCategories();
  var __initCardChanged = autoDetectCardPayments();
  if (__initExpenseChanged + __initCardChanged > 0) persistLocal();
  var currentView = "home";
  var homeSelectedMonth = null;
  var homeDetailsOpen = false;
  // 홈은 두 가지 모드다. office = 움직이는 라이브 오피스, board = 숫자만 보는 대시보드 현황.
  // 기본값은 화면 크기에 따라 다르다: 휴대폰은 지도가 작아 잘 안 보이고 배터리만 쓰므로 board 가 기본.
  // 고른 값은 데스크톱·휴대폰을 따로 기억해서, 한쪽에서 바꿨다고 다른 쪽이 끌려가지 않게 한다.
  function isNarrowScreen() {
    return !!(window.matchMedia && window.matchMedia("(max-width: 760px)").matches);
  }
  function homeModeKey() { return isNarrowScreen() ? "homeModeMobile" : "homeMode"; }
  // 홈 탭: hq(통합 업무본부) · office(라이브 오피스) · staff(직원 업무카드) · todo(대표 할 일)
  // 예전에 쓰던 "board" 값이 저장돼 있을 수 있어 hq 로 받아 준다.
  function homeMode() {
    var m = state.meta && state.meta[homeModeKey()];
    // 휴대폰에서는 움직이는 사무실을 아예 쓰지 않는다(지도가 작아 안 보이고 배터리만 먹는다).
    // 저장된 값이 office 라도 통합 업무본부로 돌린다.
    if (isNarrowScreen() && m === "office") m = "hq";
    if (m === "hq" || m === "office" || m === "staff" || m === "todo") return m;
    return isNarrowScreen() ? "hq" : "office";
  }
  var homeModeRendered = null;

  // ── 홈 탭바 (통합 업무본부 · 라이브 오피스 · 직원 업무카드 · 대표 할 일 · 관리자) ──
  // 프로토타입(aioffice) 상단 바를 옮긴 것. 앞의 넷은 홈 안에서 화면을 바꾸고,
  // 관리자만 홈이 아니라 '데이터 백업 · 공유' 화면으로 넘어간다(거기에 이미 다 있어서).
  // 순서 = 화면에 놓이는 순서. 라이브 오피스가 첫 화면이라 맨 앞에 둔다.
  var HOME_TABS = [
    { key: "office", icon: "🎮", label: "라이브 오피스" },
    { key: "hq", icon: "📋", label: "통합 업무본부" },
    { key: "staff", icon: "🗂", label: "직원 업무카드" },
    { key: "todo", icon: "📌", label: "대표 할 일", badge: true }
  ];
  // 대표 할 일 — 긴급 목록을 자르지 않고 전부 보여 준다(요약 띠는 5건까지만 보여 줌).
  function todoBoardHtml(urgentItems, endedUnpaid) {
    var html = '<div class="card section-gap home-action-card"><h3>📌 대표 할 일 · 전체<span class="count">' + urgentItems.length + "건</span></h3>";
    if (!urgentItems.length) {
      html += '<div class="list-row"><span class="txt">' + pill("지금 처리할 항목이 없어요", "good") + "</span></div>";
    } else {
      urgentItems.forEach(function (u) {
        var go = u.go && u.go !== "home" ? u.go : null;
        html += (go ? '<button type="button" class="list-row is-link" data-goto="' + go + '">' : '<div class="list-row">') +
          '<span class="dot" style="background:var(--' + u.dot + ')"></span>' +
          '<span class="txt">' + esc(u.txt) + "</span>" +
          '<span class="meta">' + esc(u.meta) + "</span>" +
          (go ? '<span class="go-arrow">›</span></button>' : "</div>");
      });
    }
    if (endedUnpaid.length) {
      var tot = endedUnpaid.reduce(function (sum, st) { return sum + studentUnpaidTotal(st); }, 0);
      html += '<button type="button" class="list-row is-link" data-goto="students"><span class="dot" style="background:var(--neutral-ink)"></span><span class="txt">과정 종료 후 미수금 (긴급 아님)</span><span class="meta">' + endedUnpaid.length + "건 · " + won(tot) + '</span><span class="go-arrow">›</span></button>';
    }
    html += "</div>";
    return html;
  }

  var homeKpiDetailOpen = {};
  var studentStatusFilter = "paid";
  var studentCourseStatusFilter = "all";
  var studentsSearchQuery = "";
  var taskFilterCategory = "all";
  var taskFilterDone = "all";
  var auctionFilterStage = "all";
  var auctionDetailId = null;
  var loanFilterStage = "all";
  var auctionsLoansTab = "auction";
  var loanConsultantSearchQuery = "";
  var loanConsultantFilterRegion = "all";
  var loanConsultantSortKey = "name";
  var loanConsultantExpandedIds = {};
  var pendingImport = null;
  var bankFilterMonth = "all";
  var bankFilterType = "all";
  var bankFilterStatus = "all";
  var bankFilterExpense = "all";
  var bankSearchQuery = "";
  var bankMultiSelectPending = {};
  var bankMultiDetailsOpen = {};
  var blogFilterStatus = "all";
  var blogExpandedIds = {};
  var blogAddFormOpen = false;
  var blogPreviewId = null;
  var blogSearchQuery = "";
  var blogTrashOpen = false;
  var marketResearchFilterStatus = "all";
  var contentIdeaFilterStatus = "all";
  var teamMemberView = null;
  var resourceFilterCategory = "all";
  var expenseMonthlyOpen = false;
  var studentExpandedIds = {};
  var courseStartLevel = Object.keys(FIXED_COURSE_WEEKS)[0] || "초급반";
  var courseStartSelectedIds = {};
  var marketFilterStatuses = {};
  var marketFilterRegion = "all";
  var marketFilterType = "아파트";
  var marketFilterAnalysis = "all";
  var marketSearchQuery = "";
  var marketDetailId = null;
  var marketSortKey = "saleDate_asc";
  var marketAddFormOpen = false;   // 모바일에서 13칸짜리 입력폼이 항상 펼쳐져 있어 목록이 한참 아래로 밀렸다
  var marketFilterOpen = false;    // 필터 줄 4개도 마찬가지. 검색만 남기고 접는다
  var marketStatsOpen = false;     // 분포 카드 3개는 매번 보는 게 아니다
  var MARKET_SORT_OPTIONS = [
    { key: "saleDate_asc", label: "매각기일 임박순" },
    { key: "saleDate_desc", label: "매각기일 늦은순" },
    { key: "date_desc", label: "등록일 최신순" },
    { key: "discount_desc", label: "할인율 높은순" },
    { key: "failCount_desc", label: "유찰횟수 많은순" }
  ];
  var studentDbFilterCourse = "all";
  var studentDbFilterMonth = "all";
  var studentDbSearchQuery = "";
  var studentDbExpandedIds = {};

  function seedInitialBlogPost(data) {
    if (data.blogPosts.length === 0 && !data.meta.blogSeeded) {
      data.blogPosts.push({
        id: uid(), date: todayStr(),
        title: "전국 아파트 경매 12년 만에 최다, 대구 낙찰가율까지 흔들리는 이유",
        topic: "대구 경매, 낙찰가율", status: "작성중", url: "",
        memo: "대구일보·영남일보 통계 기사 참고해 작성한 초안. 검수 후 발행 시 상태를 발행완료로 변경하고 URL을 채워주세요.",
        body: SEED_BLOG_BODY,
        createdAt: new Date().toISOString()
      });
      data.meta.blogSeeded = true;
    }
    return data;
  }

  function loadState() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        var parsed = JSON.parse(raw);
        parsed.students = (parsed.students || []).map(function (s) {
          s.paymentType = s.paymentType || "단발성";
          s.monthlyAmount = s.monthlyAmount || 0;
          s.installments = s.installments || [];
          return s;
        });
        parsed.auctions = parsed.auctions || [];
        parsed.loans = parsed.loans || [];
        parsed.tasks = parsed.tasks || [];
        parsed.transactions = (parsed.transactions || []).map(function (t) {
          if (t.category === undefined) {
            t.category = t.isTuition ? "tuition" : (t.notTuition ? "general" : null);
          }
          if (t.installmentId === undefined) t.installmentId = null;
          delete t.isTuition; delete t.notTuition;
          return t;
        });
        parsed.blogPosts = parsed.blogPosts || [];
        parsed.blogPostsTrash = parsed.blogPostsTrash || [];
        parsed.blogAutomationLog = parsed.blogAutomationLog || [];
        parsed.marketAuctions = parsed.marketAuctions || [];
        parsed.studentDb = parsed.studentDb || [];
        parsed.loanConsultants = parsed.loanConsultants || [];
        parsed.marketResearch = parsed.marketResearch || [];
        parsed.contentIdeas = parsed.contentIdeas || [];
        parsed.schedule = parsed.schedule || [];
        parsed.workReports = parsed.workReports || [];
        parsed.resources = parsed.resources || [];
        parsed.carouselDrafts = parsed.carouselDrafts || [];
        parsed.brandStrategyReports = parsed.brandStrategyReports || [];
        parsed.routineRuns = parsed.routineRuns || [];
        parsed.ceoOrders = parsed.ceoOrders || [];
        parsed.meta = parsed.meta || {};
        return seedInitialBlogPost(parsed);
      }
    } catch (e) {}
    return seedInitialBlogPost({ students: [], auctions: [], loans: [], tasks: [], transactions: [], blogPosts: [], blogPostsTrash: [], blogAutomationLog: [], marketAuctions: [], studentDb: [], loanConsultants: [], marketResearch: [], contentIdeas: [], schedule: [], workReports: [], resources: [], carouselDrafts: [], brandStrategyReports: [], routineRuns: [], ceoOrders: [], meta: { lastUpdated: null } });
  }

  function persistLocal() {
    state.meta.lastUpdated = new Date().toISOString();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function saveState() {
    persistLocal();
    scheduleCloudAutoSave();
  }

  function scheduleCloudAutoSave() {
    if (!window.claude || !window.claude.mcp) return;
    clearTimeout(cloudAutoSaveTimer);
    cloudAutoSaveTimer = setTimeout(function () {
      cloudAutoSaveTimer = null;
      driveSaveSnapshot(null, true);
    }, CLOUD_AUTO_SAVE_DEBOUNCE_MS);
  }

  function uid() {
    return "id" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function todayStr() {
    var d = new Date();
    return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate());
  }
  function pad2(n) { return n < 10 ? "0" + n : "" + n; }
  function monthKey() { return todayStr().slice(0, 7); }

  function parseYMD(s) {
    var parts = s.split("-");
    return new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
  }
  function formatShortDate(s) {
    if (!s) return "-";
    var d = parseYMD(s);
    var wd = ["일", "월", "화", "수", "목", "금", "토"][d.getDay()];
    return (d.getMonth() + 1) + "/" + d.getDate() + "(" + wd + ")";
  }
  function daysBetween(a, b) {
    return Math.round((parseYMD(b) - parseYMD(a)) / 86400000);
  }
  function weekRange() {
    var d = parseYMD(todayStr());
    var day = d.getDay();
    var diffToMon = day === 0 ? -6 : 1 - day;
    var mon = new Date(d); mon.setDate(d.getDate() + diffToMon);
    var sun = new Date(mon); sun.setDate(mon.getDate() + 6);
    var f = function (x) { return x.getFullYear() + "-" + pad2(x.getMonth() + 1) + "-" + pad2(x.getDate()); };
    return { start: f(mon), end: f(sun) };
  }
  function monthLabel(mk) {
    var parts = mk.split("-");
    return parts[0] + "년 " + parseInt(parts[1], 10) + "월";
  }

  function won(n) {
    n = Number(n) || 0;
    return "₩" + n.toLocaleString("ko-KR");
  }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c];
    });
  }

  function formatPhoneNumber(value) {
    var digits = String(value || "").replace(/[^0-9]/g, "").slice(0, 11);
    if (digits.length < 4) return digits;
    if (digits.slice(0, 2) === "02") {
      // 서울 지역번호(02)는 국번이 3~4자리라 나머지 유형과 자릿수가 다르다.
      if (digits.length <= 5) return digits.slice(0, 2) + "-" + digits.slice(2);
      if (digits.length <= 9) return digits.slice(0, 2) + "-" + digits.slice(2, digits.length - 4) + "-" + digits.slice(-4);
      return digits.slice(0, 2) + "-" + digits.slice(2, 6) + "-" + digits.slice(6, 10);
    }
    if (digits.length <= 7) return digits.slice(0, 3) + "-" + digits.slice(3);
    if (digits.length <= 10) return digits.slice(0, 3) + "-" + digits.slice(3, digits.length - 4) + "-" + digits.slice(-4);
    return digits.slice(0, 3) + "-" + digits.slice(3, 7) + "-" + digits.slice(7, 11);
  }

  function bindPhoneAutoFormat() {
    Array.prototype.forEach.call(document.querySelectorAll("[data-phone-input]"), function (inp) {
      inp.addEventListener("input", function () {
        var before = inp.value.slice(0, inp.selectionStart).replace(/[^0-9]/g, "").length;
        inp.value = formatPhoneNumber(inp.value);
        var pos = 0, digitsSeen = 0;
        while (pos < inp.value.length && digitsSeen < before) {
          if (/[0-9]/.test(inp.value[pos])) digitsSeen++;
          pos++;
        }
        inp.setSelectionRange(pos, pos);
      });
    });
  }

  function buildDupNameMap(list) {
    // 동명이인(같은 이름을 가진 서로 다른 사람) 구분용: 이름이 겹치는 항목에는 "-1", "-2" 식으로
    // 번호를 붙인 표시용 이름을 만든다. 실제 저장된 name 값은 건드리지 않고 화면 표시에만 쓴다.
    var counts = {};
    list.forEach(function (item) { counts[item.name] = (counts[item.name] || 0) + 1; });
    var seen = {};
    var map = {};
    list.forEach(function (item) {
      if (counts[item.name] > 1) {
        seen[item.name] = (seen[item.name] || 0) + 1;
        map[item.id] = item.name + "-" + seen[item.name];
      } else {
        map[item.id] = item.name;
      }
    });
    return map;
  }

  function pill(text, kind) {
    return '<span class="pill pill-' + kind + '">' + esc(text) + "</span>";
  }
  function tag(catKey) {
    var meta = CATEGORY_META[catKey];
    if (!meta) return "";
    return '<span class="tag" style="color:var(' + meta.inkVar + ');background:var(' + meta.bgVar + ')">' + esc(meta.label) + "</span>";
  }

  function toast(msg, duration) {
    var el = document.getElementById("toast");
    el.textContent = msg;
    el.classList.add("show");
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { el.classList.remove("show"); }, duration || 2200);
  }

  // 대리님이 대시보드를 늦게 열어서 클라우드 동기화가 조용히 여러 건 반영됐을 때,
  // "왜 미수금이 생겼는지 모르겠다" 처럼 혼란스러워하시는 일이 반복돼서 만든 기록.
  // toast()는 몇 초 뒤 사라지지만, 이건 홈 화면에 "확인했어요" 누르기 전까지 남아있는다.
  function pushSyncEvent(message) {
    if (!state.meta.syncEvents) state.meta.syncEvents = [];
    state.meta.syncEvents.unshift({ at: new Date().toISOString(), message: message });
    if (state.meta.syncEvents.length > 30) state.meta.syncEvents.length = 30;
  }
  // 예전에는 청크 수집이 실패하면 .catch(function(){}) 로 조용히 사라져서,
  // "왜 안 들어왔지"를 확인할 방법이 아예 없었다. 이제 사유를 남긴다.
  function syncChunkFailure(jobLabel) {
    return function (err) {
      var msg = (err && err.message) ? err.message : String(err);
      if (msg.length > 160) msg = msg.slice(0, 160) + "…";
      pushSyncEvent("⚠ 자동 수집 실패 — " + jobLabel + ": " + msg);
      state.meta.lastSyncError = { at: new Date().toISOString(), job: jobLabel, message: msg };
      persistLocal();
    };
  }
  function markSyncChecked() {
    state.meta.lastSyncCheckAt = new Date().toISOString();
  }
  function notifySync(msg, duration) {
    toast(msg, duration);
    pushSyncEvent(msg);
    persistLocal();
  }

  function copyToClipboard(text, okMsg) {
    function fallback() {
      var ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.focus(); ta.select();
      var ok = false;
      try { ok = document.execCommand("copy"); } catch (e) { ok = false; }
      document.body.removeChild(ta);
      toast(ok ? (okMsg || "복사되었습니다.") : "복사에 실패했습니다.");
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { toast(okMsg || "복사되었습니다."); }).catch(fallback);
    } else {
      fallback();
    }
  }

  function customConfirm(message, onConfirm) {
    var overlay = document.getElementById("confirmOverlay");
    var okBtn = document.getElementById("confirmOkBtn");
    var cancelBtn = document.getElementById("confirmCancelBtn");
    document.getElementById("confirmMsg").textContent = message;
    overlay.classList.add("show");
    function cleanup() {
      overlay.classList.remove("show");
      okBtn.removeEventListener("click", handleOk);
      cancelBtn.removeEventListener("click", handleCancel);
      overlay.removeEventListener("click", handleOverlayClick);
    }
    function handleOk() { cleanup(); onConfirm(); }
    function handleCancel() { cleanup(); }
    function handleOverlayClick(e) { if (e.target === overlay) cleanup(); }
    okBtn.addEventListener("click", handleOk);
    cancelBtn.addEventListener("click", handleCancel);
    overlay.addEventListener("click", handleOverlayClick);
  }

  function base64ToBytes(b64) {
    var binary = atob(b64);
    var bytes = new Uint8Array(binary.length);
    for (var i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }
  function base64ToUtf8(b64) {
    return new TextDecoder("utf-8").decode(base64ToBytes(b64));
  }
  function bytesToBase64(bytes) {
    var out = "", CH = 0x8000;
    for (var i = 0; i < bytes.length; i += CH) out += String.fromCharCode.apply(null, bytes.subarray(i, i + CH));
    return btoa(out);
  }
  function canGzip() { return typeof CompressionStream === "function" && typeof DecompressionStream === "function" && typeof Response === "function"; }
  // 문자열 → gzip 바이트. 브라우저가 지원 안 하면 null (그때는 예전처럼 평문 JSON 으로 올린다).
  function gzipString(str) {
    if (!canGzip()) return Promise.resolve(null);
    try {
      var stream = new Blob([str]).stream().pipeThrough(new CompressionStream("gzip"));
      return new Response(stream).arrayBuffer().then(function (buf) { return new Uint8Array(buf); });
    } catch (e) { return Promise.resolve(null); }
  }
  function isGzipBytes(bytes) { return bytes && bytes.length > 2 && bytes[0] === 0x1f && bytes[1] === 0x8b; }
  // Drive 에서 받은 base64 스냅샷 → 객체. gzip 이면 풀고, 아니면 평문 JSON 으로 읽는다.
  function decodeSnapshotB64(b64) {
    var bytes = base64ToBytes(b64);
    if (!isGzipBytes(bytes)) return Promise.resolve(JSON.parse(new TextDecoder("utf-8").decode(bytes)));
    if (!canGzip()) return Promise.reject({ code: "tool_error", message: "이 브라우저는 압축 스냅샷을 풀 수 없습니다(PC 크롬·웨일로 열어 주세요)" });
    var stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
    return new Response(stream).text().then(function (txt) { return JSON.parse(txt); });
  }

  function driveErrorMessage(err) {
    if (!err || !err.code) return "클라우드 저장소 연결에 실패했습니다.";
    switch (err.code) {
      case "not_granted":
      case "capability_disabled":
      case "capability_removed":
        return "이 화면에서는 클라우드 동기화를 쓸 수 없습니다.";
      case "server_not_connected":
        return "Google Drive가 연결되어 있지 않습니다. claude.ai 설정 → 커넥터에서 Google Drive를 연결해주세요.";
      case "needs_reauth":
        return "Google Drive 연결이 만료됐습니다. claude.ai 설정 → 커넥터에서 다시 연결해주세요.";
      case "selection_required":
        return "연결된 Google 계정이 여러 개입니다. 하나를 선택해주세요.";
      case "blocked_by_policy":
      case "approval_required":
        return "조직 정책에 의해 이 작업이 차단되어 있습니다.";
      case "server_unavailable":
        return "Google Drive에 일시적으로 연결할 수 없습니다. 잠시 후 다시 시도해주세요.";
      default:
        return "클라우드 동기화 중 오류가 발생했습니다 (" + err.code + ").";
    }
  }

  // 대시보드를 열면 청크 종류마다 search_files 를 부른다 — 스무 개가 넘게 동시에 나간다.
  // Drive 가 그걸 막고 "The service is currently unavailable" 로 되돌려주면
  // 홈 알림에 '자동 수집 실패' 가 여덟 줄씩 떴다. 실제로 그랬다.
  // 그래서 (1) 검색을 한 줄로 세워 하나씩 보내고 (2) 일시적 오류는 조용히 두 번 더 시도한다.
  var driveSearchQueue = Promise.resolve();
  var DRIVE_SEARCH_GAP_MS = 140;
  function driveWait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function driveIsTransient(err) {
    var m = String((err && (err.message || err.code)) || "");
    // "no reply from shell": 휴대폰 claude.ai 에서 Drive 호출이 호스트 응답을 못 받고 끊기는 경우.
    // 파일이 처리됨으로 찍히기 전에 실패하므로 다음에 다시 받으면 된다 — 지나가는 오류로 본다.
    return /unavailable|temporar|rate.?limit|too many|timeout|timed out|no reply|503|429|500/i.test(m);
  }
  function driveSearchOnce(query, attempt) {
    var all = [];
    function page(pageToken) {
      var input = { query: query, pageSize: 100 };
      if (pageToken) input.pageToken = pageToken;
      return window.claude.mcp.callTool(DRIVE_SERVER, "search_files", input).then(function (result) {
        var files = (result.payload && result.payload.files) || [];
        all = all.concat(files);
        var next = result.payload && result.payload.nextPageToken;
        if (next) return page(next);
        return all;
      });
    }
    return page(null).catch(function (err) {
      if (attempt < 2 && driveIsTransient(err)) {
        return driveWait(700 * (attempt + 1)).then(function () { return driveSearchOnce(query, attempt + 1); });
      }
      throw err;
    });
  }
  function driveSearchAllFiles(query) {
    var run = driveSearchQueue
      .then(function () { return driveWait(DRIVE_SEARCH_GAP_MS); })
      .then(function () { return driveSearchOnce(query, 0); });
    // 큐는 실패해도 끊기면 안 된다 — 다음 검색이 영영 안 나간다.
    driveSearchQueue = run.then(function () {}, function () {});
    return run;
  }

  function resolveDriveFolder() {
    if (driveFolderIdPromise) return driveFolderIdPromise;
    driveFolderIdPromise = window.claude.mcp.callTool(DRIVE_SERVER, "search_files", {
      query: "title = '" + DRIVE_FOLDER_TITLE + "' and mimeType = 'application/vnd.google-apps.folder'"
    }).then(function (result) {
      var files = (result.payload && result.payload.files) || [];
      if (files.length) return files[0].id;
      return window.claude.mcp.callTool(DRIVE_SERVER, "create_file", {
        title: DRIVE_FOLDER_TITLE,
        mimeType: "application/vnd.google-apps.folder"
      }).then(function (folderResult) {
        return folderResult.payload && folderResult.payload.id;
      });
    }).catch(function () {
      driveFolderIdPromise = null;
      return null;
    });
    return driveFolderIdPromise;
  }

  // 핵심 목록 개수. 빈 껍데기와 실제 데이터를 가르는 잣대다.
  // 9/16 폰 크롬이 클라우드 원본(1MB)을 못 받은 채 빈 상태로 시작해, 청크 몇 개만 얹고
  // 11KB 스냅샷을 "최신"으로 저장해 버렸다. 다른 기기가 열면 그걸 받아 전부 덮어쓸 뻔했다.
  function coreItemCount(st) {
    st = st || state;
    return (st.students || []).length + (st.transactions || []).length + (st.marketAuctions || []).length +
      (st.studentDb || []).length + (st.blogPosts || []).length;
  }
  var CORE_ITEMS_MIN_FOR_SAVE = 50;   // 이보다 적은데 클라우드 원본을 받은 적도 없으면 저장하지 않는다
  var CLOUD_SHRINK_LIMIT = 0.5;       // 받은 스냅샷이 로컬의 절반 미만이면 의심하고 덮어쓰지 않는다

  var DRIVE_SAVE_TIMEOUT_MS = 90000;   // 데스크톱은 보통 몇 초. 90초를 넘기면 끊긴 것으로 본다.
  var DRIVE_SAVE_RETRY_MS = 30000;
  function driveSaveSnapshot(onDone, silent) {
    if (!window.claude || !window.claude.mcp) {
      cloudSyncState = "offline";
      if (!silent) toast("이 화면에서는 클라우드 동기화를 쓸 수 없습니다.");
      return;
    }
    // 클라우드 원본을 한 번도 못 받은 기기에서 핵심 데이터가 거의 없으면, 그건 빈 껍데기다.
    // 저장하면 다른 기기가 그걸 최신으로 받아 전부 덮어쓴다. 저장하지 않고 이유를 남긴다.
    if (!state.meta.cloudPulledOnce && coreItemCount() < CORE_ITEMS_MIN_FOR_SAVE) {
      cloudSyncState = "error";
      state.meta.lastCloudSaveError = "클라우드 원본을 아직 못 받았고 이 기기엔 데이터가 거의 없어 저장을 보류함(빈 상태로 덮어쓰기 방지). '최신 데이터 지금 불러오기'를 먼저 눌러 주세요.";
      persistLocal(); renderNav();
      if (!silent) toast("☁ 빈 상태라 저장하지 않았습니다. 먼저 최신 데이터를 불러와 주세요.", 5000);
      return;
    }
    if (driveSyncBusy) {
      // 이미 다른 저장이 진행 중이면 이 요청은 조용히 버리지 않고, 지금 진행 중인 저장이
      // 끝나는 대로 한 번 더 저장하도록 예약해둔다 (여러 보정 함수가 동시에 끝나면서
      // 각자 저장을 시도할 때, 먼저 시작한 것만 반영되고 나머지가 누락되는 문제 방지).
      driveSaveSnapshotPending = true;
      return;
    }
    driveSyncBusy = true;
    cloudSyncState = "syncing";
    renderNav();
    if (!silent) toast("스냅샷 저장 중...", 4000);
    // 휴대폰에서 1MB 저장 호출이 영영 안 끝나는 일이 있었다(9/16 07:14 "동기화 중…" 11분+).
    // 그러면 driveSyncBusy 가 풀리지 않아 이후 저장이 전부 조용히 버려진다. 시간 제한을 걸고,
    // 넘기면 오류로 돌려 다음 저장이 다시 시도되게 한다.
    var timedOut = false;
    var saveTimer = setTimeout(function () {
      timedOut = true;
      driveSyncBusy = false;
      cloudSyncState = "error";
      state.meta.lastCloudSaveError = "저장 응답 없음(" + Math.round(DRIVE_SAVE_TIMEOUT_MS / 1000) + "초) — 다시 시도합니다";
      renderNav();
      if (!silent) toast("☁ 저장 응답이 없어 잠시 후 다시 시도합니다.", 4500);
      cloudAutoSaveTimer = setTimeout(function () { cloudAutoSaveTimer = null; driveSaveSnapshot(null, true); }, DRIVE_SAVE_RETRY_MS);
    }, DRIVE_SAVE_TIMEOUT_MS);
    var snapshotText = JSON.stringify(state);
    Promise.all([resolveDriveFolder(), gzipString(snapshotText)]).then(function (pair) {
      var folderId = pair[0], gz = pair[1];
      var payload;
      if (gz && gz.length) {
        payload = { title: DRIVE_SNAPSHOT_TITLE_GZ, base64Content: bytesToBase64(gz), contentMimeType: "application/gzip", disableConversionToGoogleType: true };
      } else {
        payload = { title: DRIVE_SNAPSHOT_TITLE, textContent: snapshotText, contentMimeType: "application/json", disableConversionToGoogleType: true };
      }
      state.meta.lastCloudSaveBytes = gz && gz.length ? gz.length : snapshotText.length;
      state.meta.lastCloudSaveGzip = !!(gz && gz.length);
      if (folderId) payload.parentId = folderId;
      return window.claude.mcp.callTool(DRIVE_SERVER, "create_file", payload);
    }).then(function (result) {
      clearTimeout(saveTimer);
      if (timedOut) return;   // 이미 오류로 돌리고 재시도를 걸어 뒀다. 늦게 온 성공은 다음 저장이 덮는다.
      state.meta.lastCloudSaveError = "";
      var savedTime = (result.payload && result.payload.modifiedTime) || new Date().toISOString();
      state.meta.lastCloudSync = new Date().toISOString();
      state.meta.cloudFileModifiedTime = savedTime;
      persistLocal();
      cloudSyncState = "synced";
      if (!silent) toast("☁ 스냅샷을 저장했습니다.");
      renderNav();
      if (onDone) onDone();
    }).catch(function (err) {
      clearTimeout(saveTimer);
      if (timedOut) return;
      cloudSyncState = "error";
      state.meta.lastCloudSaveError = driveErrorMessage(err);
      if (!silent) toast(driveErrorMessage(err), 4500);
      renderNav();
    }).then(function () {
      if (timedOut) return;
      driveSyncBusy = false;
      if (driveSaveSnapshotPending) {
        driveSaveSnapshotPending = false;
        driveSaveSnapshot(null, true);
      }
    });
  }

  function driveLoadLatestSnapshot(onDone) {
    if (!window.claude || !window.claude.mcp) { toast("이 화면에서는 클라우드 동기화를 쓸 수 없습니다."); return; }
    if (driveSyncBusy) return;
    driveSyncBusy = true;
    toast("최신 스냅샷을 찾는 중...", 4000);
    driveSearchAllFiles(DRIVE_SNAPSHOT_QUERY).then(function (files) {
      if (!files.length) { toast("저장된 스냅샷이 아직 없습니다. 먼저 스냅샷을 저장해주세요."); driveSyncBusy = false; return; }
      files.sort(function (a, b) { return new Date(b.modifiedTime) - new Date(a.modifiedTime); });
      var latest = files[0];
      return window.claude.mcp.callTool(DRIVE_SERVER, "download_file_content", { fileId: latest.id }).then(function (dlResult) {
        var b64 = dlResult.payload && dlResult.payload.content;
        if (!b64) throw { code: "tool_error", message: "빈 파일" };
        return decodeSnapshotB64(b64);
      }).then(function (incoming) {
        customConfirm("클라우드의 최신 스냅샷(" + new Date(latest.modifiedTime).toLocaleString("ko-KR") + ")을 불러와 현재 데이터를 덮어씁니다. 계속할까요?", function () {
          state = {
            students: incoming.students || [], auctions: incoming.auctions || [],
            loans: incoming.loans || [], tasks: incoming.tasks || [], transactions: incoming.transactions || [],
            blogPosts: incoming.blogPosts || [], blogPostsTrash: incoming.blogPostsTrash || [], blogAutomationLog: incoming.blogAutomationLog || [], marketAuctions: incoming.marketAuctions || [], studentDb: incoming.studentDb || [], loanConsultants: incoming.loanConsultants || [],
            marketResearch: incoming.marketResearch || [], contentIdeas: incoming.contentIdeas || [], schedule: incoming.schedule || [], workReports: incoming.workReports || [], resources: incoming.resources || [], carouselDrafts: incoming.carouselDrafts || [], brandStrategyReports: incoming.brandStrategyReports || [], routineRuns: incoming.routineRuns || [], ceoOrders: incoming.ceoOrders || [],
            meta: incoming.meta || {}
          };
          state.meta.lastCloudSync = new Date().toISOString();
          state.meta.cloudFileModifiedTime = latest.modifiedTime;
          state.meta.cloudPulledOnce = true;
          persistLocal(); toast("☁ 최신 스냅샷을 불러왔습니다."); render();
          if (onDone) onDone();
        });
      });
    }).catch(function (err) {
      toast(driveErrorMessage(err), 4500);
    }).then(function () { driveSyncBusy = false; });
  }

  function driveAutoSyncCheck(opts) {
    opts = opts || {};
    if (!window.claude || !window.claude.mcp) { cloudSyncState = "offline"; return; }
    if (driveSyncBusy) return;
    driveSyncBusy = true;
    cloudSyncState = "syncing";
    renderNav();
    driveSearchAllFiles(DRIVE_SNAPSHOT_QUERY).then(function (files) {
      if (!files.length) {
        driveSyncBusy = false;
        cloudSyncState = "synced";
        renderNav();
        var hasData = state.students.length || state.auctions.length || state.loans.length ||
          state.transactions.length || state.blogPosts.length || state.tasks.length || state.marketAuctions.length || state.studentDb.length;
        if (opts.pushIfEmpty && hasData) driveSaveSnapshot(null, true);
        if (opts.onDone) opts.onDone();
        return;
      }
      files.sort(function (a, b) { return new Date(b.modifiedTime) - new Date(a.modifiedTime); });
      var latest = files[0];
      var knownTime = state.meta.cloudFileModifiedTime;
      if (knownTime && new Date(latest.modifiedTime).getTime() <= new Date(knownTime).getTime()) {
        driveSyncBusy = false;
        cloudSyncState = "synced";
        renderNav();
        if (opts.onDone) opts.onDone();
        return;
      }
      window.claude.mcp.callTool(DRIVE_SERVER, "download_file_content", { fileId: latest.id }).then(function (dlResult) {
        var b64 = dlResult.payload && dlResult.payload.content;
        if (!b64) throw { code: "tool_error", message: "빈 파일" };
        return decodeSnapshotB64(b64);
      }).then(function (incoming) {
        // 받은 스냅샷이 지금 것의 절반도 안 되면 잘못 저장된 빈 껍데기일 가능성이 크다.
        // 덮어쓰지 않고 알린다. (9/16 폰 크롬이 11KB 짜리를 올린 사고)
        var mine = coreItemCount(), theirs = coreItemCount(incoming);
        if (mine >= CORE_ITEMS_MIN_FOR_SAVE && theirs < mine * CLOUD_SHRINK_LIMIT) {
          state.meta.cloudFileModifiedTime = latest.modifiedTime;   // 같은 파일을 매번 다시 받지 않게
          state.meta.cloudPulledOnce = true;
          persistLocal();
          cloudSyncState = "synced";
          pushSyncEvent("⚠ 클라우드 스냅샷(" + new Date(latest.modifiedTime).toLocaleString("ko-KR") +
            ")이 이 기기 데이터보다 훨씬 작아(" + theirs + " vs " + mine + "건) 받지 않았습니다. 다른 기기가 빈 상태로 저장한 것일 수 있어요.");
          render(); driveSyncBusy = false;
          if (opts.onDone) opts.onDone();
          return;
        }
        state = {
          students: incoming.students || [], auctions: incoming.auctions || [],
          loans: incoming.loans || [], tasks: incoming.tasks || [], transactions: incoming.transactions || [],
          blogPosts: incoming.blogPosts || [], blogPostsTrash: incoming.blogPostsTrash || [], blogAutomationLog: incoming.blogAutomationLog || [], marketAuctions: incoming.marketAuctions || [], studentDb: incoming.studentDb || [], loanConsultants: incoming.loanConsultants || [],
          marketResearch: incoming.marketResearch || [], contentIdeas: incoming.contentIdeas || [], schedule: incoming.schedule || [], workReports: incoming.workReports || [], resources: incoming.resources || [], carouselDrafts: incoming.carouselDrafts || [], brandStrategyReports: incoming.brandStrategyReports || [], routineRuns: incoming.routineRuns || [], ceoOrders: incoming.ceoOrders || [],
          meta: incoming.meta || {}
        };
        state.meta.lastCloudSync = new Date().toISOString();
        state.meta.cloudFileModifiedTime = latest.modifiedTime;
        state.meta.cloudPulledOnce = true;
        persistLocal();
        cloudSyncState = "synced";
        if (opts.notify) toast("☁ 다른 기기의 최신 데이터를 불러왔습니다.");
        render();
        driveSyncBusy = false;
        if (opts.onDone) opts.onDone();
      }).catch(function () {
        cloudSyncState = "error";
        renderNav();
        driveSyncBusy = false;
        if (opts.onDone) opts.onDone();
      });
    }).catch(function () {
      cloudSyncState = "error";
      renderNav();
      driveSyncBusy = false;
      if (opts.onDone) opts.onDone();
    });
  }

  function mergeChunkImportIfNeeded(opts) {
    // opts: { chunkPrefix, mergedFlagKey, listKey, dedupeKey(item)->string, label, onDone }
    function finish() { if (opts.onDone) opts.onDone(); }
    if (!window.claude || !window.claude.mcp) { finish(); return; }
    if (state.meta[opts.mergedFlagKey]) { finish(); return; }
    resolveDriveFolder().then(function (folderId) {
      var query = "title contains '" + opts.chunkPrefix + "'";
      if (folderId) query += " and parentId = '" + folderId + "'";
      return driveSearchAllFiles(query);
    }).then(function (files) {
      if (!files.length) { state.meta[opts.mergedFlagKey] = true; persistLocal(); return null; }
      files.sort(function (a, b) { return a.title < b.title ? -1 : (a.title > b.title ? 1 : 0); });
      var expectedTotal = null;
      var seenIdx = {};
      files.forEach(function (f) {
        var m = /_(\d+)_of_(\d+)\.json$/.exec(f.title);
        if (m) { seenIdx[parseInt(m[1], 10)] = true; expectedTotal = parseInt(m[2], 10); }
      });
      if (expectedTotal) {
        for (var i = 1; i <= expectedTotal; i++) {
          if (!seenIdx[i]) return null; // incomplete set, retry later without setting the flag
        }
      }
      var chain = Promise.resolve([]);
      files.forEach(function (f) {
        chain = chain.then(function (acc) {
          return window.claude.mcp.callTool(DRIVE_SERVER, "download_file_content", { fileId: f.id }).then(function (dl) {
            var b64 = dl.payload && dl.payload.content;
            if (!b64) return acc;
            var arr = JSON.parse(base64ToUtf8(b64));
            return acc.concat(arr);
          });
        });
      });
      return chain.then(function (items) { return { complete: true, items: items }; });
    }).then(function (result) {
      if (!result || !result.complete) return;
      var existingKeys = {};
      state[opts.listKey].forEach(function (t) { existingKeys[opts.dedupeKey(t)] = true; });
      var added = 0;
      (result.items || []).forEach(function (t) {
        var k = opts.dedupeKey(t);
        if (existingKeys[k]) return;
        existingKeys[k] = true;
        state[opts.listKey].push(t);
        added++;
      });
      state.meta[opts.mergedFlagKey] = true;
      persistLocal();
      if (added) {
        notifySync("☁ " + opts.label + " " + added + "건을 불러와 저장했습니다.");
        render();
        driveSaveSnapshot(null, true);
      }
    }).catch(syncChunkFailure(opts.label || "청크 가져오기")).then(finish);
  }

  function mergeBankImportChunksIfNeeded(onDone) {
    mergeChunkImportIfNeeded({
      chunkPrefix: DRIVE_BANK_CHUNK_PREFIX, mergedFlagKey: "bankImportMergedV2", listKey: "transactions",
      dedupeKey: function (t) { return t.sig; }, label: "은행거래내역", onDone: onDone
    });
  }

  function mergeStudentDbChunksIfNeeded(onDone) {
    mergeChunkImportIfNeeded({
      chunkPrefix: DRIVE_STUDENTDB_CHUNK_PREFIX, mergedFlagKey: "studentDbMergedV1", listKey: "studentDb",
      dedupeKey: function (t) { return t.id; }, label: "수강생 DB", onDone: onDone
    });
  }

  function mergeStudentDbAdditionChunksIfNeeded(onDone) {
    // 대리님이 채팅으로 전달한 수강생 명단(이름/연락처/과정/시간 등)을 청크 파일로 만들어 계속
    // 등록할 때 쓰는 경로. mergeStudentDbChunksIfNeeded와 달리 1회성이 아니며, 이미 등록된
    // 사람은 연락처(전화번호) 기준으로 자동으로 건너뛴다.
    function finish() { if (onDone) onDone(); }
    if (!window.claude || !window.claude.mcp) { finish(); return; }
    var processed = state.meta.processedStudentDbAddChunkIds || {};
    resolveDriveFolder().then(function (folderId) {
      var query = "title contains '" + DRIVE_STUDENTDB_ADD_CHUNK_PREFIX + "'";
      if (folderId) query += " and parentId = '" + folderId + "'";
      return driveSearchAllFiles(query);
    }).then(function (files) {
      files = files.filter(function (f) { return f.title && f.title.indexOf(DRIVE_STUDENTDB_ADD_CHUNK_PREFIX) === 0; });
      var pending = files.filter(function (f) { return !processed[f.id]; });
      if (!pending.length) return null;
      var chain = Promise.resolve([]);
      pending.forEach(function (f) {
        chain = chain.then(function (acc) {
          return window.claude.mcp.callTool(DRIVE_SERVER, "download_file_content", { fileId: f.id }).then(function (dl) {
            processed[f.id] = true;
            var b64 = dl.payload && dl.payload.content;
            if (!b64) return acc;
            var arr = JSON.parse(base64ToUtf8(b64));
            return acc.concat(arr);
          }).catch(function () { return acc; }); // 받다가 실패한 파일은 처리됨으로 찍지 않는다 — 다음에 다시 받는다
        });
      });
      return chain;
    }).then(function (items) {
      if (!items) return;
      var normPhone = function (p) { return (p || "").replace(/[^0-9]/g, ""); };
      var existingPhones = {};
      state.studentDb.forEach(function (s) { var k = normPhone(s.phone); if (k) existingPhones[k] = true; });
      var added = 0, skipped = 0;
      items.forEach(function (t) {
        var k = normPhone(t.phone);
        if (k && existingPhones[k]) { skipped++; return; }
        if (!t.id) t.id = uid();
        state.studentDb.push(t);
        if (k) existingPhones[k] = true;
        added++;
      });
      state.meta.processedStudentDbAddChunkIds = processed;
      persistLocal();
      if (added || skipped) {
        var msg = "☁ 수강생 명단 ";
        if (added) msg += added + "명 등록";
        if (added && skipped) msg += " · ";
        if (skipped) msg += "중복 " + skipped + "명 제외";
        notifySync(msg + "되었습니다.");
        render();
        driveSaveSnapshot(null, true);
      }
    }).catch(syncChunkFailure("수강생 DB 추가")).then(finish);
  }

  function mergeBlogTrashChunksIfNeeded(onDone) {
    // 대리님이 채팅으로 "이런 글은 삭제해줘"라고 하면, 이 세션에서는 대리님 브라우저의
    // blogPosts를 직접 건드릴 수 없어 id 목록만 청크 파일(ahj_blog_trash_chunk_*.json,
    // [{id}, ...] 형태)로 올린다. 여기서 그 id에 해당하는 글을 찾아 blogPostsTrash로
    // 옮긴다 — ✕ 버튼을 눌렀을 때와 똑같이 완전 삭제가 아니라 휴지통行(復원 가능).
    function finish() { if (onDone) onDone(); }
    if (!window.claude || !window.claude.mcp) { finish(); return; }
    var processed = state.meta.processedBlogTrashChunkIds || {};
    resolveDriveFolder().then(function (folderId) {
      var query = "title contains '" + DRIVE_BLOG_TRASH_CHUNK_PREFIX + "'";
      if (folderId) query += " and parentId = '" + folderId + "'";
      return driveSearchAllFiles(query);
    }).then(function (files) {
      files = files.filter(function (f) { return f.title && f.title.indexOf(DRIVE_BLOG_TRASH_CHUNK_PREFIX) === 0; });
      var pending = files.filter(function (f) { return !processed[f.id]; });
      if (!pending.length) return null;
      var chain = Promise.resolve([]);
      pending.forEach(function (f) {
        chain = chain.then(function (acc) {
          return window.claude.mcp.callTool(DRIVE_SERVER, "download_file_content", { fileId: f.id }).then(function (dl) {
            processed[f.id] = true;
            var b64 = dl.payload && dl.payload.content;
            if (!b64) return acc;
            var arr = JSON.parse(base64ToUtf8(b64));
            return acc.concat(arr);
          }).catch(function () { return acc; }); // 받다가 실패한 파일은 처리됨으로 찍지 않는다 — 다음에 다시 받는다
        });
      });
      return chain;
    }).then(function (items) {
      if (!items) return;
      var trashed = 0;
      items.forEach(function (t) {
        var idx = state.blogPosts.findIndex(function (x) { return x.id === t.id; });
        if (idx === -1) return;
        var moved = state.blogPosts.splice(idx, 1)[0];
        moved.deletedAt = new Date().toISOString();
        state.blogPostsTrash.unshift(moved);
        trashed++;
      });
      state.meta.processedBlogTrashChunkIds = processed;
      persistLocal();
      if (trashed) {
        notifySync("☁ 글 " + trashed + "건을 휴지통으로 옮겼습니다.");
        render();
        driveSaveSnapshot(null, true);
      }
    }).catch(syncChunkFailure("블로그 휴지통")).then(finish);
  }

  function mergeBlogDraftChunksIfNeeded(onDone) {
    // 매일 아침 블로그 소재 자동수집 루틴이 전체 스냅샷을 재업로드하지 않고, 그날 결과만 담은
    // 작은 청크 파일(ahj_blog_chunk_*.json)을 올리면 여기서 병합한다. 파일 형식은 두 가지:
    //  - 예전 형식: 블로그 아이디어 객체 배열 그대로
    //  - 새 형식: { runAt, status:"success"|"no_new"|"error", addedCount, note, items:[...] }
    // 새 형식은 items가 비어있거나(새 소재 없음) 실패한 날에도 항상 올려서, "AI 직원이 오늘 실행됐는지"를
    // state.blogAutomationLog 로 확인할 수 있게 한다. 파일 하나하나를 처리한 id는 state.meta에 기록해
    // 다음날도 같은 파일을 재처리하지 않는다.
    function finish() { if (onDone) onDone(); }
    if (!window.claude || !window.claude.mcp) { finish(); return; }
    var processed = state.meta.processedBlogChunkIds || {};
    resolveDriveFolder().then(function (folderId) {
      var query = "title contains '" + DRIVE_BLOG_CHUNK_PREFIX + "'";
      if (folderId) query += " and parentId = '" + folderId + "'";
      return driveSearchAllFiles(query);
    }).then(function (files) {
      files = files.filter(function (f) { return f.title && f.title.indexOf(DRIVE_BLOG_CHUNK_PREFIX) === 0; });
      var pending = files.filter(function (f) { return !processed[f.id]; });
      if (!pending.length) return null;
      var chain = Promise.resolve({ items: [], logs: [] });
      pending.forEach(function (f) {
        chain = chain.then(function (acc) {
          return window.claude.mcp.callTool(DRIVE_SERVER, "download_file_content", { fileId: f.id }).then(function (dl) {
            processed[f.id] = true;
            var b64 = dl.payload && dl.payload.content;
            if (!b64) return acc;
            var parsed = JSON.parse(base64ToUtf8(b64));
            var items, logEntry;
            if (Array.isArray(parsed)) {
              items = parsed;
              logEntry = { id: f.id, runAt: f.modifiedTime || new Date().toISOString(), status: "success", addedCount: items.length, note: "" };
            } else {
              items = parsed.items || [];
              logEntry = {
                id: f.id, runAt: parsed.runAt || f.modifiedTime || new Date().toISOString(),
                status: parsed.status || "success",
                addedCount: parsed.addedCount != null ? parsed.addedCount : items.length,
                note: parsed.note || ""
              };
            }
            acc.items = acc.items.concat(items);
            acc.logs.push(logEntry);
            return acc;
          }).catch(function () { return acc; }); // 받다가 실패한 파일은 처리됨으로 찍지 않는다 — 다음에 다시 받는다
        });
      });
      return chain;
    }).then(function (result) {
      if (!result) return;
      // id가 이미 있는 글이면 업데이트(재검수/재작성 반영), 없으면 새로 추가한다.
      var added = 0, updated = 0;
      result.items.forEach(function (p) {
        var existing = state.blogPosts.find(function (x) { return x.id === p.id; });
        var trashedExisting = state.blogPostsTrash.find(function (x) { return x.id === p.id; });
        if (existing) {
          Object.keys(p).forEach(function (k) { existing[k] = p[k]; });
          updated++;
        } else if (trashedExisting) {
          // 대리님이 이미 휴지통으로 보낸 글이면 다시 목록에 올리지 않고, 휴지통 안의 기록만 최신화한다.
          Object.keys(p).forEach(function (k) { trashedExisting[k] = p[k]; });
          updated++;
        } else {
          state.blogPosts.push(p);
          added++;
        }
      });
      var existingLogIds = {};
      state.blogAutomationLog.forEach(function (l) { existingLogIds[l.id] = true; });
      result.logs.forEach(function (l) {
        if (existingLogIds[l.id]) return;
        existingLogIds[l.id] = true;
        state.blogAutomationLog.push(l);
      });
      state.blogAutomationLog.sort(function (a, b) { return a.runAt < b.runAt ? 1 : (a.runAt > b.runAt ? -1 : 0); });
      if (state.blogAutomationLog.length > 60) state.blogAutomationLog.length = 60;
      state.meta.processedBlogChunkIds = processed;
      persistLocal();
      if (added || updated || result.logs.length) {
        if (added || updated) {
          var msg = "☁ 블로그 소재 ";
          if (added) msg += added + "건 추가";
          if (added && updated) msg += " · ";
          if (updated) msg += updated + "건 재검수 반영";
          notifySync(msg + "되었습니다.");
        }
        render();
        driveSaveSnapshot(null, true);
      }
    }).catch(syncChunkFailure("블로그 초안")).then(finish);
  }

  function submitBlogRevisionRequest(postId, note) {
    // 보류된 글에 대리님이 수정사항을 남기면, 작은 요청 파일을 올려서 다음 시간 단위 재검수
    // 루틴(또는 채팅 요청)이 이 글을 정보검수 단계부터 다시 처리하도록 신호를 보낸다.
    var p = state.blogPosts.find(function (x) { return x.id === postId; });
    if (!p) return;
    if (!window.claude || !window.claude.mcp) { toast("이 화면에서는 재검수 요청을 보낼 수 없습니다."); return; }
    var now = new Date().toISOString();
    p.revisionRequestedAt = now;
    p.revisionNote = note;
    saveState();
    render();
    var payload = {
      title: DRIVE_BLOG_REVISION_CHUNK_PREFIX + postId + "_" + Date.now() + ".json",
      textContent: JSON.stringify({ postId: postId, title: p.title, originalHoldReason: p.holdReason || "", revisionNote: note, requestedAt: now }),
      contentMimeType: "application/json",
      disableConversionToGoogleType: true
    };
    resolveDriveFolder().then(function (folderId) {
      if (folderId) payload.parentId = folderId;
      return window.claude.mcp.callTool(DRIVE_SERVER, "create_file", payload);
    }).then(function () {
      toast("🔄 재검수 요청을 보냈습니다. 최대 1시간 이내 자동으로 다시 처리됩니다.");
    }).catch(function () {
      toast("재검수 요청 업로드에 실패했습니다. 다시 시도해주세요.");
    });
  }

  function mergeBankAdditionChunksIfNeeded(onDone) {
    // 대리님이 채팅으로 보내주신 은행 거래내역 엑셀(우리은행 등)을 직접 읽고 파싱해서,
    // 작은 청크 파일(ahj_bank_addition_chunk_*.json)로 은행 거래내역에 등록한다.
    // (기존 mergeBankImportChunksIfNeeded는 최초 1회성 대량 이관용이라 이후 추가에는 쓸 수 없어 별도로 둔다.)
    // 같은 sig(날짜|적요|입금|출금|잔액)가 이미 있으면 건너뛰고, 없으면 새로 추가한다.
    function finish() { if (onDone) onDone(); }
    if (!window.claude || !window.claude.mcp) { finish(); return; }
    var processed = state.meta.processedBankAdditionChunkIds || {};
    resolveDriveFolder().then(function (folderId) {
      var query = "title contains '" + DRIVE_BANK_ADDITION_CHUNK_PREFIX + "'";
      if (folderId) query += " and parentId = '" + folderId + "'";
      return driveSearchAllFiles(query);
    }).then(function (files) {
      files = files.filter(function (f) { return f.title && f.title.indexOf(DRIVE_BANK_ADDITION_CHUNK_PREFIX) === 0; });
      var pending = files.filter(function (f) { return !processed[f.id]; });
      if (!pending.length) return null;
      var chain = Promise.resolve([]);
      pending.forEach(function (f) {
        chain = chain.then(function (acc) {
          return window.claude.mcp.callTool(DRIVE_SERVER, "download_file_content", { fileId: f.id }).then(function (dl) {
            processed[f.id] = true;
            var b64 = dl.payload && dl.payload.content;
            if (!b64) return acc;
            var arr = JSON.parse(base64ToUtf8(b64));
            return acc.concat(arr);
          }).catch(function () { return acc; }); // 받다가 실패한 파일은 처리됨으로 찍지 않는다 — 다음에 다시 받는다
        });
      });
      return chain;
    }).then(function (items) {
      if (!items) return;
      var existingSigs = {};
      state.transactions.forEach(function (t) { existingSigs[t.sig] = true; });
      var added = 0;
      items.forEach(function (t) {
        if (!t.sig || existingSigs[t.sig]) return;
        existingSigs[t.sig] = true;
        if (!t.id) t.id = uid();
        state.transactions.push(t);
        added++;
      });
      state.meta.processedBankAdditionChunkIds = processed;
      if (added) { autoClassifyExpenseCategories(); autoDetectCardPayments(); }
      persistLocal();
      if (added) {
        notifySync("☁ 은행 거래내역 " + added + "건이 추가되었습니다.");
        render();
        driveSaveSnapshot(null, true);
      }
    }).catch(syncChunkFailure("은행 거래 추가")).then(finish);
  }

  function mergeStudentTuitionPatchChunksIfNeeded(onDone) {
    // 대리님이 은행 입금 내역으로 실제 결제를 확인했지만 state.students(수강생·매출)의 tuition 필드가
    // 0으로 비어있던 건을 보정하는 청크(ahj_student_tuition_patch_chunk_*.json,
    // [{studentId, tuition}, ...] 배열)를 반영한다. 이미 tuition 값이 있으면(0이 아니면)
    // 절대 덮어쓰지 않는다 — 기존에 확인된 값을 실수로 훼손하지 않기 위함.
    function finish() { if (onDone) onDone(); }
    if (!window.claude || !window.claude.mcp) { finish(); return; }
    var processed = state.meta.processedStudentTuitionPatchChunkIds || {};
    resolveDriveFolder().then(function (folderId) {
      var query = "title contains '" + DRIVE_STUDENT_TUITION_PATCH_CHUNK_PREFIX + "'";
      if (folderId) query += " and parentId = '" + folderId + "'";
      return driveSearchAllFiles(query);
    }).then(function (files) {
      files = files.filter(function (f) { return f.title && f.title.indexOf(DRIVE_STUDENT_TUITION_PATCH_CHUNK_PREFIX) === 0; });
      var pending = files.filter(function (f) { return !processed[f.id]; });
      if (!pending.length) return null;
      var chain = Promise.resolve([]);
      pending.forEach(function (f) {
        chain = chain.then(function (acc) {
          return window.claude.mcp.callTool(DRIVE_SERVER, "download_file_content", { fileId: f.id }).then(function (dl) {
            processed[f.id] = true;
            var b64 = dl.payload && dl.payload.content;
            if (!b64) return acc;
            var arr = JSON.parse(base64ToUtf8(b64));
            return acc.concat(arr);
          }).catch(function () { return acc; }); // 받다가 실패한 파일은 처리됨으로 찍지 않는다 — 다음에 다시 받는다
        });
      });
      return chain;
    }).then(function (patches) {
      if (!patches) return;
      var patched = 0;
      patches.forEach(function (p) {
        if (!p || !p.studentId || !(p.tuition > 0)) return;
        var s = state.students && state.students.find(function (x) { return x.id === p.studentId; });
        if (!s || s.tuition) return;
        s.tuition = p.tuition;
        patched++;
      });
      state.meta.processedStudentTuitionPatchChunkIds = processed;
      persistLocal();
      if (patched) {
        notifySync("☁ 수강생 수강료 " + patched + "건이 보정되었습니다.");
        render();
        driveSaveSnapshot(null, true);
      }
    }).catch(syncChunkFailure("수강료 보정")).then(finish);
  }
  function mergeCourseStartDatePatchChunksIfNeeded(onDone) {
    // 초급반·중급반은 기수제로 운영되고 기수마다 개강일이 신청일과 별도로 달라진다(대리님 피드백).
    // "반 개강일(기수) 설정" 도구로 선택한 학생들에 courseStartDate를 일괄 적용할 때, 브라우저가 열려있지
    // 않은 상태에서도 반영되도록 청크(ahj_course_start_patch_chunk_*.json, [{studentId, courseStartDate}, ...]
    // 배열)로 전달한다. 기수 배정은 매번 새로 지정하는 값이라 기존 값이 있어도 덮어쓴다(tuition 보정과 다름).
    function finish() { if (onDone) onDone(); }
    if (!window.claude || !window.claude.mcp) { finish(); return; }
    var processed = state.meta.processedCourseStartPatchChunkIds || {};
    resolveDriveFolder().then(function (folderId) {
      var query = "title contains '" + DRIVE_COURSE_START_PATCH_CHUNK_PREFIX + "'";
      if (folderId) query += " and parentId = '" + folderId + "'";
      return driveSearchAllFiles(query);
    }).then(function (files) {
      files = files.filter(function (f) { return f.title && f.title.indexOf(DRIVE_COURSE_START_PATCH_CHUNK_PREFIX) === 0; });
      var pending = files.filter(function (f) { return !processed[f.id]; });
      if (!pending.length) return null;
      var chain = Promise.resolve([]);
      pending.forEach(function (f) {
        chain = chain.then(function (acc) {
          return window.claude.mcp.callTool(DRIVE_SERVER, "download_file_content", { fileId: f.id }).then(function (dl) {
            processed[f.id] = true;
            var b64 = dl.payload && dl.payload.content;
            if (!b64) return acc;
            var arr = JSON.parse(base64ToUtf8(b64));
            return acc.concat(arr);
          }).catch(function () { return acc; }); // 받다가 실패한 파일은 처리됨으로 찍지 않는다 — 다음에 다시 받는다
        });
      });
      return chain;
    }).then(function (patches) {
      if (!patches) return;
      var patched = 0;
      patches.forEach(function (p) {
        if (!p || !p.studentId || !p.courseStartDate) return;
        var s = state.students && state.students.find(function (x) { return x.id === p.studentId; });
        if (!s) return;
        s.courseStartDate = p.courseStartDate;
        patched++;
      });
      state.meta.processedCourseStartPatchChunkIds = processed;
      persistLocal();
      if (patched) {
        notifySync("☁ 수강생 개강일 " + patched + "건이 설정되었습니다.");
        render();
        driveSaveSnapshot(null, true);
      }
    }).catch(syncChunkFailure("개강일 보정")).then(finish);
  }

  function kpiLogFor(key) {
    if (!state.meta.kpiLog) state.meta.kpiLog = {};
    if (!state.meta.kpiLog[key]) state.meta.kpiLog[key] = {};
    return state.meta.kpiLog[key];
  }
  function mergeKpiLogChunksIfNeeded(onDone) {
    // 대시보드가 스스로 셀 수 없는 KPI(예: 권리분석 완료 건수)는 대리님이 채팅으로 "9/8 3건"처럼
    // 알려주면 청크(ahj_kpi_log_chunk_*.json, [{key, date, count, note?}, ...])로 날짜별 건수를 기록한다.
    // 같은 key·date 가 이미 있으면 새 값으로 덮어쓴다(정정 가능). 주간 KPI 표가 주 단위로 합산한다.
    function finish() { if (onDone) onDone(); }
    if (!window.claude || !window.claude.mcp) { finish(); return; }
    var processed = state.meta.processedKpiLogChunkIds || {};
    resolveDriveFolder().then(function (folderId) {
      var query = "title contains '" + DRIVE_KPI_LOG_CHUNK_PREFIX + "'";
      if (folderId) query += " and parentId = '" + folderId + "'";
      return driveSearchAllFiles(query);
    }).then(function (files) {
      files = files.filter(function (f) { return f.title && f.title.indexOf(DRIVE_KPI_LOG_CHUNK_PREFIX) === 0; });
      var pending = files.filter(function (f) { return !processed[f.id]; });
      if (!pending.length) return null;
      var chain = Promise.resolve([]);
      pending.forEach(function (f) {
        chain = chain.then(function (acc) {
          return window.claude.mcp.callTool(DRIVE_SERVER, "download_file_content", { fileId: f.id }).then(function (dl) {
            processed[f.id] = true;
            var b64 = dl.payload && dl.payload.content;
            if (!b64) return acc;
            var arr = JSON.parse(base64ToUtf8(b64));
            return acc.concat(arr);
          }).catch(function () { return acc; }); // 받다가 실패한 파일은 처리됨으로 찍지 않는다 — 다음에 다시 받는다
        });
      });
      return chain;
    }).then(function (items) {
      if (!items) return;
      var changed = 0;
      items.forEach(function (it) {
        if (!it || !it.key || !it.date) return;
        var log = kpiLogFor(it.key);
        var n = Math.max(0, Number(it.count) || 0);
        if (log[it.date] !== n) { log[it.date] = n; changed++; }
      });
      state.meta.processedKpiLogChunkIds = processed;
      persistLocal();
      if (changed) {
        notifySync("☁ KPI 기록 " + changed + "건이 반영되었습니다.");
        render();
        driveSaveSnapshot(null, true);
      }
    }).catch(syncChunkFailure("권리분석 건수")).then(finish);
  }

  // ───────── 범용 패치 청크 (ahj_patch_chunk_*.json) ─────────
  // 새 데이터 종류가 생길 때마다 merge 함수를 추가하고 재발행하던 방식을 대신한다.
  // 항목 형식: { op: "set"|"push"|"delete", list: "<state 목록 이름>", match?: {필드: 값}, fields?: {...}, upsert?: true, allowBulk?: true }
  //  - set:    match 로 찾은 항목에 fields 를 덮어쓴다. 못 찾고 upsert 면 match+fields 로 새로 만든다.
  //  - push:   fields 로 새 항목을 추가한다(id 없으면 생성). match 가 있고 이미 같은 항목이 있으면 건너뛴다.
  //  - delete: match 로 찾은 항목을 지운다.
  //  - list "meta": state.meta 에 fields 를 덮어쓴다(match 불필요).
  // 안전장치: 허용된 목록만, 2026-08-05 대량 이관 학생은 allowBulk 없이는 건드리지 않는다.
  var PATCH_ALLOWED_LISTS = ["students", "studentDb", "transactions", "marketAuctions", "blogPosts", "auctions", "loans", "tasks", "loanConsultants", "marketResearch", "contentIdeas", "schedule", "workReports", "resources", "carouselDrafts", "brandStrategyReports", "blogAutomationLog", "routineRuns", "ceoOrders"];
  function patchMatches(item, match) {
    return Object.keys(match).every(function (k) { return item && item[k] === match[k]; });
  }
  function applyGenericPatch(it, stats) {
    if (!it || !it.op || !it.list) return;
    if (it.list === "meta") {
      if (it.op === "set" && it.fields) { Object.keys(it.fields).forEach(function (k) { state.meta[k] = it.fields[k]; }); stats.set++; }
      return;
    }
    if (PATCH_ALLOWED_LISTS.indexOf(it.list) === -1 || !Array.isArray(state[it.list])) { stats.skipped++; return; }
    var list = state[it.list];
    var match = it.match && Object.keys(it.match).length ? it.match : null;
    var found = match ? list.filter(function (x) { return patchMatches(x, match); }) : [];
    if (it.list === "students" && !it.allowBulk) {
      found = found.filter(function (x) { return bulkImportIds().indexOf(x.id) === -1; });
    }
    if (it.op === "set") {
      if (!match) { stats.skipped++; return; }
      if (found.length) {
        found.forEach(function (x) { Object.keys(it.fields || {}).forEach(function (k) { x[k] = it.fields[k]; }); });
        stats.set += found.length;
      } else if (it.upsert) {
        var n = Object.assign({}, match, it.fields || {}); if (!n.id) n.id = uid();
        list.push(n); stats.push++;
      } else stats.skipped++;
    } else if (it.op === "push") {
      if (match && found.length) { stats.skipped++; return; }
      var m = Object.assign({}, match || {}, it.fields || {}); if (!m.id) m.id = uid();
      list.push(m); stats.push++;
    } else if (it.op === "delete") {
      if (!match || !found.length) { stats.skipped++; return; }
      if (it.list === "marketAuctions") found.forEach(function (x) { rememberMarketDeleted(x.caseNumber); });
      state[it.list] = list.filter(function (x) { return found.indexOf(x) === -1; });
      stats.del += found.length;
    } else stats.skipped++;
    if (it.list === "transactions") stats.txTouched = true;
  }
  function mergeGenericPatchChunksIfNeeded(onDone) {
    function finish() { if (onDone) onDone(); }
    if (!window.claude || !window.claude.mcp) { finish(); return; }
    var processed = state.meta.processedPatchChunkIds || {};
    resolveDriveFolder().then(function (folderId) {
      var query = "title contains '" + DRIVE_PATCH_CHUNK_PREFIX + "'";
      if (folderId) query += " and parentId = '" + folderId + "'";
      return driveSearchAllFiles(query);
    }).then(function (files) {
      files = files.filter(function (f) { return f.title && f.title.indexOf(DRIVE_PATCH_CHUNK_PREFIX) === 0; });
      var pending = files.filter(function (f) { return !processed[f.id]; });
      if (!pending.length) { markSyncChecked(); persistLocal(); return null; }
      pending.sort(function (a, b) { return a.title < b.title ? -1 : (a.title > b.title ? 1 : 0); });
      var chain = Promise.resolve([]);
      pending.forEach(function (f) {
        chain = chain.then(function (acc) {
          return window.claude.mcp.callTool(DRIVE_SERVER, "download_file_content", { fileId: f.id }).then(function (dl) {
            processed[f.id] = true;
            var b64 = dl.payload && dl.payload.content;
            if (!b64) return acc;
            var arr = JSON.parse(base64ToUtf8(b64));
            return acc.concat(Array.isArray(arr) ? arr : (arr && Array.isArray(arr.items) ? arr.items : []));
          }).catch(function () { return acc; }); // 받다가 실패한 파일은 처리됨으로 찍지 않는다 — 다음에 다시 받는다
        });
      });
      return chain;
    }).then(function (items) {
      if (!items) return;
      var stats = { set: 0, push: 0, del: 0, skipped: 0, txTouched: false };
      items.forEach(function (it) { try { applyGenericPatch(it, stats); } catch (e) { stats.skipped++; } });
      state.meta.processedPatchChunkIds = processed;
      if (stats.txTouched) { autoClassifyExpenseCategories(); autoDetectCardPayments(); }
      markSyncChecked();
      persistLocal();
      var total = stats.set + stats.push + stats.del;
      if (total) {
        var parts = [];
        if (stats.set) parts.push("수정 " + stats.set);
        if (stats.push) parts.push("추가 " + stats.push);
        if (stats.del) parts.push("삭제 " + stats.del);
        notifySync("☁ 원격 패치 " + parts.join(" · ") + "건이 반영되었습니다" + (stats.skipped ? " (건너뜀 " + stats.skipped + ")" : "") + ".");
        render();
        driveSaveSnapshot(null, true);
      }
    }).catch(syncChunkFailure("원격 패치")).then(finish);
  }

  function mergeStudentAdditionChunksIfNeeded(onDone) {
    // 대리님이 채팅으로 "OOO은 21기 초급반 신규"처럼 알려주신 수강생을, 마법사를 직접 열지 않아도
    // 수강생·매출 명단(state.students)에 등록하는 청크(ahj_student_add_chunk_*.json).
    // 각 항목: { student: {수강생 레코드}, dbPatch?: {수강생 DB 항목에 덮어쓸 값}, txSig?: 연결할 입금 sig }
    //  - student.id 가 이미 있으면 건너뛴다(중복 등록 방지). student.studentDbId 로 DB 항목과 연동한다.
    //  - txSig 가 있으면 그 은행 거래를 이 학생의 수강료 입금으로 연결한다(studentId·category=tuition).
    //    은행 거래는 mergeBankAdditionChunksIfNeeded 가 먼저 넣어 두어야 하므로 그 뒤에 이어서 실행한다.
    function finish() { if (onDone) onDone(); }
    if (!window.claude || !window.claude.mcp) { finish(); return; }
    var processed = state.meta.processedStudentAddChunkIds || {};
    resolveDriveFolder().then(function (folderId) {
      var query = "title contains '" + DRIVE_STUDENT_ADD_CHUNK_PREFIX + "'";
      if (folderId) query += " and parentId = '" + folderId + "'";
      return driveSearchAllFiles(query);
    }).then(function (files) {
      files = files.filter(function (f) { return f.title && f.title.indexOf(DRIVE_STUDENT_ADD_CHUNK_PREFIX) === 0; });
      var pending = files.filter(function (f) { return !processed[f.id]; });
      if (!pending.length) return null;
      var chain = Promise.resolve([]);
      pending.forEach(function (f) {
        chain = chain.then(function (acc) {
          return window.claude.mcp.callTool(DRIVE_SERVER, "download_file_content", { fileId: f.id }).then(function (dl) {
            processed[f.id] = true;
            var b64 = dl.payload && dl.payload.content;
            if (!b64) return acc;
            var arr = JSON.parse(base64ToUtf8(b64));
            return acc.concat(arr);
          }).catch(function () { return acc; }); // 받다가 실패한 파일은 처리됨으로 찍지 않는다 — 다음에 다시 받는다
        });
      });
      return chain;
    }).then(function (items) {
      if (!items) return;
      var added = 0, linked = 0;
      items.forEach(function (it) {
        if (!it || !it.student || !it.student.name) return;
        var src = it.student;
        if (src.id && state.students.some(function (x) { return x.id === src.id; })) return;
        var st = {
          id: src.id || uid(), name: src.name, level: src.level || "초급반",
          appliedDate: src.appliedDate || todayStr(), status: src.status || "등록완료",
          paymentType: src.paymentType || "단발성", tuition: Number(src.tuition) || 0,
          monthlyAmount: Number(src.monthlyAmount) || 0, paid: !!src.paid, paidDate: src.paidDate || null,
          taxInvoice: !!src.taxInvoice, cardPayment: !!src.cardPayment, memo: src.memo || "",
          studentDbId: src.studentDbId || null, installments: Array.isArray(src.installments) ? src.installments : []
        };
        if (src.courseStartDate) st.courseStartDate = src.courseStartDate;
        state.students.push(st);
        added++;
        var db = st.studentDbId ? state.studentDb.find(function (x) { return x.id === st.studentDbId; }) : null;
        if (db) {
          db.linkedStudentId = st.id;
          if (it.dbPatch) Object.keys(it.dbPatch).forEach(function (k) { db[k] = it.dbPatch[k]; });
        }
        if (it.txSig) {
          var tx = state.transactions.find(function (x) { return x.sig === it.txSig; });
          if (tx) {
            tx.studentId = st.id; tx.category = "tuition";
            if (it.installmentId) tx.installmentId = it.installmentId;
            if (!st.paid && st.paymentType !== "월별") { st.paid = true; st.paidDate = st.paidDate || tx.date; }
            linked++;
          }
        }
      });
      state.meta.processedStudentAddChunkIds = processed;
      persistLocal();
      if (added) {
        notifySync("☁ 수강생 " + added + "명이 등록되었습니다" + (linked ? " (입금 " + linked + "건 연결)" : "") + ".");
        render();
        driveSaveSnapshot(null, true);
      }
    }).catch(syncChunkFailure("수강생 추가")).then(finish);
  }

  function mergeBankCategoryPatchChunksIfNeeded(onDone) {
    // 이미 등록된 은행 거래(카드사 정산 입금 등)의 category 필드가 비어있어 "수강료 입금" 등
    // 세부 통계에서 누락되는 건을 보정하는 청크(ahj_bank_category_patch_chunk_*.json,
    // [{sig, category}, ...] 배열)를 반영한다. 이미 category 값이 있으면(비어있지 않으면)
    // 절대 덮어쓰지 않는다 — 기존에 확인된 분류를 실수로 훼손하지 않기 위함.
    function finish() { if (onDone) onDone(); }
    if (!window.claude || !window.claude.mcp) { finish(); return; }
    var processed = state.meta.processedBankCategoryPatchChunkIds || {};
    resolveDriveFolder().then(function (folderId) {
      var query = "title contains '" + DRIVE_BANK_CATEGORY_PATCH_CHUNK_PREFIX + "'";
      if (folderId) query += " and parentId = '" + folderId + "'";
      return driveSearchAllFiles(query);
    }).then(function (files) {
      files = files.filter(function (f) { return f.title && f.title.indexOf(DRIVE_BANK_CATEGORY_PATCH_CHUNK_PREFIX) === 0; });
      var pending = files.filter(function (f) { return !processed[f.id]; });
      if (!pending.length) return null;
      var chain = Promise.resolve([]);
      pending.forEach(function (f) {
        chain = chain.then(function (acc) {
          return window.claude.mcp.callTool(DRIVE_SERVER, "download_file_content", { fileId: f.id }).then(function (dl) {
            processed[f.id] = true;
            var b64 = dl.payload && dl.payload.content;
            if (!b64) return acc;
            var arr = JSON.parse(base64ToUtf8(b64));
            return acc.concat(arr);
          }).catch(function () { return acc; }); // 받다가 실패한 파일은 처리됨으로 찍지 않는다 — 다음에 다시 받는다
        });
      });
      return chain;
    }).then(function (patches) {
      if (!patches) return;
      var patched = 0;
      patches.forEach(function (p) {
        if (!p || !p.sig || !p.category) return;
        var t = state.transactions.find(function (x) { return x.sig === p.sig; });
        if (!t || t.category) return;
        t.category = p.category;
        patched++;
      });
      state.meta.processedBankCategoryPatchChunkIds = processed;
      persistLocal();
      if (patched) {
        notifySync("☁ 은행 거래 카테고리 " + patched + "건이 보정되었습니다.");
        render();
        driveSaveSnapshot(null, true);
      }
    }).catch(syncChunkFailure("거래 분류 보정")).then(finish);
  }

  function mergeStudentDeleteChunksIfNeeded(onDone) {
    // 대리님이 채팅으로 "이 수강생은 중복이니 삭제해줘"라고 요청한 경우, 이 세션에서는 대리님
    // 브라우저의 students/studentDb를 직접 건드릴 수 없어 id 목록만 청크 파일
    // (ahj_student_delete_chunk_*.json, [{studentId, studentDbId}, ...] 형태)로 올린다.
    // 여기서 해당 id를 찾아 완전히 제거한다 — 복원 불가한 영구 삭제이므로, 중복 등록 등
    // 명백한 데이터 오류를 정리할 때만 사용한다.
    function finish() { if (onDone) onDone(); }
    if (!window.claude || !window.claude.mcp) { finish(); return; }
    var processed = state.meta.processedStudentDeleteChunkIds || {};
    resolveDriveFolder().then(function (folderId) {
      var query = "title contains '" + DRIVE_STUDENT_DELETE_CHUNK_PREFIX + "'";
      if (folderId) query += " and parentId = '" + folderId + "'";
      return driveSearchAllFiles(query);
    }).then(function (files) {
      files = files.filter(function (f) { return f.title && f.title.indexOf(DRIVE_STUDENT_DELETE_CHUNK_PREFIX) === 0; });
      var pending = files.filter(function (f) { return !processed[f.id]; });
      if (!pending.length) return null;
      var chain = Promise.resolve([]);
      pending.forEach(function (f) {
        chain = chain.then(function (acc) {
          return window.claude.mcp.callTool(DRIVE_SERVER, "download_file_content", { fileId: f.id }).then(function (dl) {
            processed[f.id] = true;
            var b64 = dl.payload && dl.payload.content;
            if (!b64) return acc;
            var arr = JSON.parse(base64ToUtf8(b64));
            return acc.concat(arr);
          }).catch(function () { return acc; }); // 받다가 실패한 파일은 처리됨으로 찍지 않는다 — 다음에 다시 받는다
        });
      });
      return chain;
    }).then(function (items) {
      if (!items) return;
      var deleted = 0;
      items.forEach(function (it) {
        if (!it) return;
        if (it.studentId) {
          var idx = state.students.findIndex(function (x) { return x.id === it.studentId; });
          if (idx !== -1) { state.students.splice(idx, 1); deleted++; }
        }
        if (it.studentDbId) {
          var idx2 = state.studentDb.findIndex(function (x) { return x.id === it.studentDbId; });
          if (idx2 !== -1) { state.studentDb.splice(idx2, 1); deleted++; }
        }
      });
      state.meta.processedStudentDeleteChunkIds = processed;
      persistLocal();
      if (deleted) {
        notifySync("☁ 중복/오류 수강생 레코드 " + deleted + "건이 정리되었습니다.");
        render();
        driveSaveSnapshot(null, true);
      }
    }).catch(syncChunkFailure("수강생 삭제")).then(finish);
  }

  function mergeBankCategoryOverrideChunksIfNeeded(onDone) {
    // 대리님이 "이 입금은 사실 수강료가 아니라 컨설팅비다" 등으로 잘못된 분류를 직접 정정해준
    // 경우를 위한 청크(ahj_bank_category_override_chunk_*.json, [{sig, category}, ...] 배열).
    // mergeBankCategoryPatchChunksIfNeeded와 달리, 이미 값이 있어도 명시적으로 덮어쓴다
    // (대리님이 확인해준 정정 사항이므로). "해제" 버튼과 동일하게 studentId·installmentId
    // 연결도 함께 해제하고, 더 이상 연결된 수강료 거래가 없으면 학생의 paid 상태도 되돌린다.
    function finish() { if (onDone) onDone(); }
    if (!window.claude || !window.claude.mcp) { finish(); return; }
    var processed = state.meta.processedBankCategoryOverrideChunkIds || {};
    resolveDriveFolder().then(function (folderId) {
      var query = "title contains '" + DRIVE_BANK_CATEGORY_OVERRIDE_CHUNK_PREFIX + "'";
      if (folderId) query += " and parentId = '" + folderId + "'";
      return driveSearchAllFiles(query);
    }).then(function (files) {
      files = files.filter(function (f) { return f.title && f.title.indexOf(DRIVE_BANK_CATEGORY_OVERRIDE_CHUNK_PREFIX) === 0; });
      var pending = files.filter(function (f) { return !processed[f.id]; });
      if (!pending.length) return null;
      var chain = Promise.resolve([]);
      pending.forEach(function (f) {
        chain = chain.then(function (acc) {
          return window.claude.mcp.callTool(DRIVE_SERVER, "download_file_content", { fileId: f.id }).then(function (dl) {
            processed[f.id] = true;
            var b64 = dl.payload && dl.payload.content;
            if (!b64) return acc;
            var arr = JSON.parse(base64ToUtf8(b64));
            return acc.concat(arr);
          }).catch(function () { return acc; }); // 받다가 실패한 파일은 처리됨으로 찍지 않는다 — 다음에 다시 받는다
        });
      });
      return chain;
    }).then(function (overrides) {
      if (!overrides) return;
      var changed = 0;
      overrides.forEach(function (o) {
        if (!o || !o.sig || !o.category) return;
        var t = state.transactions.find(function (x) { return x.sig === o.sig; });
        if (!t || t.category === o.category) return;
        var oldStudentId = t.studentId, oldInstallmentId = t.installmentId;
        t.category = o.category;
        t.studentId = null;
        t.installmentId = null;
        t.studentLinks = null;
        if (oldStudentId) {
          revertTuitionLink(oldStudentId, oldInstallmentId);
          // 단발성 학생의 유일한 수강료 거래가 다른 카테고리로 정정된 경우,
          // paid만 되돌리고 tuition 금액을 그대로 두면 "미확정 입금" 목록에
          // 유령 미수금이 새로 나타난다. 더 이상 연결된 수강료 거래가 없으면 금액도 0으로 되돌린다.
          if (!oldInstallmentId) {
            var stillLinkedFlat = state.transactions.some(function (x) {
              return (x.studentId === oldStudentId && !x.installmentId && x.category === "tuition") ||
                (x.studentLinks || []).some(function (l) { return l.studentId === oldStudentId && !l.installmentId; });
            });
            if (!stillLinkedFlat) {
              var stForReset = state.students.find(function (x) { return x.id === oldStudentId; });
              if (stForReset && stForReset.paymentType === "단발성") stForReset.tuition = 0;
            }
          }
        }
        changed++;
      });
      state.meta.processedBankCategoryOverrideChunkIds = processed;
      persistLocal();
      if (changed) {
        notifySync("☁ 은행 거래 카테고리 " + changed + "건이 정정되었습니다.");
        render();
        driveSaveSnapshot(null, true);
      }
    }).catch(syncChunkFailure("거래 분류 덮어쓰기")).then(finish);
  }

  function mergeInstallmentAdditionChunksIfNeeded(onDone) {
    // 대리님이 "이번 회차는 실제로는 X월 결제였다"처럼, 새로 확정되는 월별 수강생의 회차를
    // 화면의 "오늘 날짜 기준 현재월"이 아니라 명시적으로 지정한 월로 등록해달라고 요청한 경우를 위한
    // 청크(ahj_installment_addition_chunk_*.json, [{studentId, round, month, amount}, ...] 배열).
    // 이미 같은 round 번호의 회차가 있으면 중복 추가하지 않는다.
    function finish() { if (onDone) onDone(); }
    if (!window.claude || !window.claude.mcp) { finish(); return; }
    var processed = state.meta.processedInstallmentAdditionChunkIds || {};
    resolveDriveFolder().then(function (folderId) {
      var query = "title contains '" + DRIVE_INSTALLMENT_ADDITION_CHUNK_PREFIX + "'";
      if (folderId) query += " and parentId = '" + folderId + "'";
      return driveSearchAllFiles(query);
    }).then(function (files) {
      files = files.filter(function (f) { return f.title && f.title.indexOf(DRIVE_INSTALLMENT_ADDITION_CHUNK_PREFIX) === 0; });
      var pending = files.filter(function (f) { return !processed[f.id]; });
      if (!pending.length) return null;
      var chain = Promise.resolve([]);
      pending.forEach(function (f) {
        chain = chain.then(function (acc) {
          return window.claude.mcp.callTool(DRIVE_SERVER, "download_file_content", { fileId: f.id }).then(function (dl) {
            processed[f.id] = true;
            var b64 = dl.payload && dl.payload.content;
            if (!b64) return acc;
            var arr = JSON.parse(base64ToUtf8(b64));
            return acc.concat(arr);
          }).catch(function () { return acc; }); // 받다가 실패한 파일은 처리됨으로 찍지 않는다 — 다음에 다시 받는다
        });
      });
      return chain;
    }).then(function (additions) {
      if (!additions) return;
      var added = 0;
      additions.forEach(function (a) {
        if (!a || !a.studentId || !a.round || !a.month) return;
        var s = state.students && state.students.find(function (x) { return x.id === a.studentId; });
        if (!s) return;
        s.installments = s.installments || [];
        var exists = s.installments.some(function (i) { return i.round === a.round; });
        if (exists) return;
        s.installments.push({
          id: uid(), round: a.round, month: a.month, amount: Number(a.amount) || 0,
          paid: true, taxInvoice: false, cardPayment: false
        });
        added++;
      });
      state.meta.processedInstallmentAdditionChunkIds = processed;
      persistLocal();
      if (added) {
        notifySync("☁ 수강생 회차 " + added + "건이 추가되었습니다.");
        render();
        driveSaveSnapshot(null, true);
      }
    }).catch(syncChunkFailure("회차 추가")).then(finish);
  }

  function mergeRevenueUnconfirmChunksIfNeeded(onDone) {
    // 매출로 인식돼 있던 항목인데, 은행 거래내역을 대조해봐도 실제 입금 거래를 찾지 못한 경우를 위한
    // 청크(ahj_revenue_unconfirm_chunk_*.json, [{kind:"student"|"installment", studentId, installmentId}, ...] 배열).
    // "입금일자로 매출확정을 잡는다"는 원칙에 따라, 확정(paid) 상태를 되돌려 미확정 상태로 만든다.
    // kind:"student" — 단발성 학생의 paid를 되돌린다(tuition 금액은 남겨둬 "미확정 입금"으로 계속 추적 가능하게 함).
    // kind:"installment" — 월별 학생의 해당 회차만 paid를 되돌린다.
    function finish() { if (onDone) onDone(); }
    if (!window.claude || !window.claude.mcp) { finish(); return; }
    var processed = state.meta.processedRevenueUnconfirmChunkIds || {};
    resolveDriveFolder().then(function (folderId) {
      var query = "title contains '" + DRIVE_REVENUE_UNCONFIRM_CHUNK_PREFIX + "'";
      if (folderId) query += " and parentId = '" + folderId + "'";
      return driveSearchAllFiles(query);
    }).then(function (files) {
      files = files.filter(function (f) { return f.title && f.title.indexOf(DRIVE_REVENUE_UNCONFIRM_CHUNK_PREFIX) === 0; });
      var pending = files.filter(function (f) { return !processed[f.id]; });
      if (!pending.length) return null;
      var chain = Promise.resolve([]);
      pending.forEach(function (f) {
        chain = chain.then(function (acc) {
          return window.claude.mcp.callTool(DRIVE_SERVER, "download_file_content", { fileId: f.id }).then(function (dl) {
            processed[f.id] = true;
            var b64 = dl.payload && dl.payload.content;
            if (!b64) return acc;
            var arr = JSON.parse(base64ToUtf8(b64));
            return acc.concat(arr);
          }).catch(function () { return acc; }); // 받다가 실패한 파일은 처리됨으로 찍지 않는다 — 다음에 다시 받는다
        });
      });
      return chain;
    }).then(function (items) {
      if (!items) return;
      var changed = 0;
      items.forEach(function (it) {
        if (!it || !it.studentId) return;
        var s = state.students.find(function (x) { return x.id === it.studentId; });
        if (!s) return;
        if (it.kind === "installment" && it.installmentId) {
          var inst = (s.installments || []).find(function (i) { return i.id === it.installmentId; });
          if (inst && inst.paid) { inst.paid = false; changed++; }
        } else if (it.kind === "student") {
          if (s.paid) { s.paid = false; s.paidDate = null; changed++; }
        }
      });
      state.meta.processedRevenueUnconfirmChunkIds = processed;
      persistLocal();
      if (changed) {
        notifySync("☁ 입금 미확인 매출 " + changed + "건을 미확정 처리했습니다.");
        render();
        driveSaveSnapshot(null, true);
      }
    }).catch(syncChunkFailure("매출 확정 해제")).then(finish);
  }

  function mergeRevenueReconfirmChunksIfNeeded(onDone) {
    // 카드결제는 카드수수료가 빠진 금액으로 입금돼(정확금액 매칭에 안 걸림) 미확정 처리됐다가,
    // 실제로는 sig로 특정되는 은행 거래가 존재해 다시 결제완료로 되돌리는 청크
    // (ahj_revenue_reconfirm_chunk_*.json, [{kind:"student"|"installment", studentId, installmentId?, txSig}, ...] 배열).
    // txSig가 가리키는 거래에 studentId가 비어있으면 그 거래도 함께 연결해준다(이미 연결돼 있으면 건드리지 않음).
    function finish() { if (onDone) onDone(); }
    if (!window.claude || !window.claude.mcp) { finish(); return; }
    var processed = state.meta.processedRevenueReconfirmChunkIds || {};
    resolveDriveFolder().then(function (folderId) {
      var query = "title contains '" + DRIVE_REVENUE_RECONFIRM_CHUNK_PREFIX + "'";
      if (folderId) query += " and parentId = '" + folderId + "'";
      return driveSearchAllFiles(query);
    }).then(function (files) {
      files = files.filter(function (f) { return f.title && f.title.indexOf(DRIVE_REVENUE_RECONFIRM_CHUNK_PREFIX) === 0; });
      var pending = files.filter(function (f) { return !processed[f.id]; });
      if (!pending.length) return null;
      var chain = Promise.resolve([]);
      pending.forEach(function (f) {
        chain = chain.then(function (acc) {
          return window.claude.mcp.callTool(DRIVE_SERVER, "download_file_content", { fileId: f.id }).then(function (dl) {
            processed[f.id] = true;
            var b64 = dl.payload && dl.payload.content;
            if (!b64) return acc;
            var arr = JSON.parse(base64ToUtf8(b64));
            return acc.concat(arr);
          }).catch(function () { return acc; }); // 받다가 실패한 파일은 처리됨으로 찍지 않는다 — 다음에 다시 받는다
        });
      });
      return chain;
    }).then(function (items) {
      if (!items) return;
      var changed = 0;
      items.forEach(function (it) {
        if (!it || !it.studentId) return;
        var s = state.students.find(function (x) { return x.id === it.studentId; });
        if (!s) return;
        if (it.kind === "installment" && it.installmentId) {
          var inst = (s.installments || []).find(function (i) { return i.id === it.installmentId; });
          if (inst && !inst.paid) { inst.paid = true; changed++; }
        } else if (it.kind === "student") {
          if (!s.paid) { s.paid = true; changed++; }
        }
        if (it.txSig) {
          var t = state.transactions.find(function (x) { return x.sig === it.txSig; });
          if (t && !t.studentId) {
            t.studentId = it.studentId;
            if (it.installmentId) t.installmentId = it.installmentId;
          }
          // 확정 매출은 실제 입금일 기준으로 월 집계되므로, 단발성 학생의 paidDate가 비어있으면
          // 연결한 거래의 날짜로 채운다(backfillStudentPaidDateIfNeeded는 1회성이라 이후 건은 여기서).
          if (t && it.kind === "student" && s.paymentType !== "월별" && !s.paidDate) { s.paidDate = t.date; changed++; }
          if (t && it.kind === "student" && t.cardPayment && !s.cardPayment) s.cardPayment = true;
        }
      });
      state.meta.processedRevenueReconfirmChunkIds = processed;
      persistLocal();
      if (changed) {
        notifySync("☁ 카드수수료 차감 입금 확인 " + changed + "건을 결제완료로 재반영했습니다.");
        render();
        driveSaveSnapshot(null, true);
      }
    }).catch(syncChunkFailure("매출 재확정")).then(finish);
  }

  function mergeRevenueLinkFixChunksIfNeeded(onDone) {
    // 은행거래 하나가 잘못된 학생/회차에 연결됐던 걸 바로잡는 청크(ahj_revenue_link_fix_chunk_*.json,
    // [{txSig, oldStudentId?, oldInstallmentId?, newStudentId, newInstallmentId?}, ...] 배열).
    // txSig 거래의 studentId/installmentId를 새 값으로 강제로 덮어쓰고(이미 다른 곳에 잘못 연결돼
    // 있었더라도 교정), oldStudentId 쪽 회차는 다시 미확정(paid=false)으로, newStudentId 쪽 회차는
    // 결제완료(paid=true)로 되돌린다. mergeRevenueReconfirmChunksIfNeeded와 달리 이미 연결된 거래도
    // 덮어쓸 수 있어 오연결을 정정할 때 쓴다.
    function finish() { if (onDone) onDone(); }
    if (!window.claude || !window.claude.mcp) { finish(); return; }
    var processed = state.meta.processedRevenueLinkFixChunkIds || {};
    resolveDriveFolder().then(function (folderId) {
      var query = "title contains '" + DRIVE_REVENUE_LINK_FIX_CHUNK_PREFIX + "'";
      if (folderId) query += " and parentId = '" + folderId + "'";
      return driveSearchAllFiles(query);
    }).then(function (files) {
      files = files.filter(function (f) { return f.title && f.title.indexOf(DRIVE_REVENUE_LINK_FIX_CHUNK_PREFIX) === 0; });
      var pending = files.filter(function (f) { return !processed[f.id]; });
      if (!pending.length) return null;
      var chain = Promise.resolve([]);
      pending.forEach(function (f) {
        chain = chain.then(function (acc) {
          return window.claude.mcp.callTool(DRIVE_SERVER, "download_file_content", { fileId: f.id }).then(function (dl) {
            processed[f.id] = true;
            var b64 = dl.payload && dl.payload.content;
            if (!b64) return acc;
            var arr = JSON.parse(base64ToUtf8(b64));
            return acc.concat(arr);
          }).catch(function () { return acc; }); // 받다가 실패한 파일은 처리됨으로 찍지 않는다 — 다음에 다시 받는다
        });
      });
      return chain;
    }).then(function (items) {
      if (!items) return;
      var changed = 0;
      items.forEach(function (it) {
        if (!it || !it.txSig || !it.newStudentId) return;
        var t = state.transactions.find(function (x) { return x.sig === it.txSig; });
        if (!t) return;
        if (it.oldStudentId) {
          var os = state.students.find(function (x) { return x.id === it.oldStudentId; });
          if (os && it.oldInstallmentId) {
            var oi = (os.installments || []).find(function (i) { return i.id === it.oldInstallmentId; });
            if (oi && oi.paid) { oi.paid = false; changed++; }
          }
        }
        t.studentId = it.newStudentId;
        if (it.newInstallmentId) t.installmentId = it.newInstallmentId;
        var ns = state.students.find(function (x) { return x.id === it.newStudentId; });
        if (ns && it.newInstallmentId) {
          var ni = (ns.installments || []).find(function (i) { return i.id === it.newInstallmentId; });
          if (ni && !ni.paid) { ni.paid = true; changed++; }
        }
      });
      state.meta.processedRevenueLinkFixChunkIds = processed;
      persistLocal();
      if (changed) {
        notifySync("☁ 입금 연결 오류 " + changed + "건을 정정했습니다.");
        render();
        driveSaveSnapshot(null, true);
      }
    }).catch(syncChunkFailure("입금 연결 보정")).then(finish);
  }

  function mergeLoanConsultantChunksIfNeeded(onDone) {
    // 대리님이 채팅으로 보내주신 대출상담사 명단 엑셀을 정리해서, 작은 청크 파일
    // (ahj_loan_consultant_chunk_*.json, 상담사 객체 배열)로 대출상담사 DB에 등록한다.
    // 연락처(phone)가 이미 있으면 건너뛰고(중복 방지), 없으면 새로 추가한다.
    function finish() { if (onDone) onDone(); }
    if (!window.claude || !window.claude.mcp) { finish(); return; }
    var processed = state.meta.processedLoanConsultantChunkIds || {};
    resolveDriveFolder().then(function (folderId) {
      var query = "title contains '" + DRIVE_LOAN_CONSULTANT_CHUNK_PREFIX + "'";
      if (folderId) query += " and parentId = '" + folderId + "'";
      return driveSearchAllFiles(query);
    }).then(function (files) {
      files = files.filter(function (f) { return f.title && f.title.indexOf(DRIVE_LOAN_CONSULTANT_CHUNK_PREFIX) === 0; });
      var pending = files.filter(function (f) { return !processed[f.id]; });
      if (!pending.length) return null;
      var chain = Promise.resolve([]);
      pending.forEach(function (f) {
        chain = chain.then(function (acc) {
          return window.claude.mcp.callTool(DRIVE_SERVER, "download_file_content", { fileId: f.id }).then(function (dl) {
            processed[f.id] = true;
            var b64 = dl.payload && dl.payload.content;
            if (!b64) return acc;
            var arr = JSON.parse(base64ToUtf8(b64));
            return acc.concat(arr);
          }).catch(function () { return acc; }); // 받다가 실패한 파일은 처리됨으로 찍지 않는다 — 다음에 다시 받는다
        });
      });
      return chain;
    }).then(function (items) {
      if (!items) return;
      var existingPhones = {};
      state.loanConsultants.forEach(function (c) { if (c.phone) existingPhones[c.phone] = true; });
      var added = 0;
      items.forEach(function (c) {
        if (c.phone && existingPhones[c.phone]) return;
        if (c.phone) existingPhones[c.phone] = true;
        if (!c.id) c.id = uid();
        state.loanConsultants.push(c);
        added++;
      });
      state.meta.processedLoanConsultantChunkIds = processed;
      persistLocal();
      if (added) {
        notifySync("☁ 대출상담사 " + added + "명이 추가되었습니다.");
        render();
        driveSaveSnapshot(null, true);
      }
    }).catch(syncChunkFailure("대출상담사")).then(finish);
  }

  function mergeBrandStrategyChunksIfNeeded(onDone) {
    // 🧭 브랜드전략담당이 매주 조사한 경쟁사 분석 리포트를 작은 청크 파일
    // (ahj_brandstrategy_chunk_*.json, 리포트 객체 배열)로 올리면 여기서 병합한다.
    // 같은 id가 있으면 최신 내용으로 갱신(재조사 반영)하고, 없으면 새로 추가한다.
    function finish() { if (onDone) onDone(); }
    if (!window.claude || !window.claude.mcp) { finish(); return; }
    var processed = state.meta.processedBrandStrategyChunkIds || {};
    resolveDriveFolder().then(function (folderId) {
      var query = "title contains '" + DRIVE_BRAND_STRATEGY_CHUNK_PREFIX + "'";
      if (folderId) query += " and parentId = '" + folderId + "'";
      return driveSearchAllFiles(query);
    }).then(function (files) {
      files = files.filter(function (f) { return f.title && f.title.indexOf(DRIVE_BRAND_STRATEGY_CHUNK_PREFIX) === 0; });
      var pending = files.filter(function (f) { return !processed[f.id]; });
      if (!pending.length) return null;
      var chain = Promise.resolve([]);
      pending.forEach(function (f) {
        chain = chain.then(function (acc) {
          return window.claude.mcp.callTool(DRIVE_SERVER, "download_file_content", { fileId: f.id }).then(function (dl) {
            processed[f.id] = true;
            var b64 = dl.payload && dl.payload.content;
            if (!b64) return acc;
            var arr = JSON.parse(base64ToUtf8(b64));
            return acc.concat(arr);
          }).catch(function () { return acc; }); // 받다가 실패한 파일은 처리됨으로 찍지 않는다 — 다음에 다시 받는다
        });
      });
      return chain;
    }).then(function (items) {
      if (!items) return;
      var added = 0, updated = 0;
      items.forEach(function (r) {
        if (!r.id) r.id = uid();
        var existing = state.brandStrategyReports.find(function (x) { return x.id === r.id; });
        if (existing) { Object.keys(r).forEach(function (k) { existing[k] = r[k]; }); updated++; }
        else { state.brandStrategyReports.push(r); added++; }
      });
      state.meta.processedBrandStrategyChunkIds = processed;
      persistLocal();
      if (added || updated) {
        notifySync("☁ 브랜드전략 리포트 " + (added ? added + "건 추가" : "") + (added && updated ? " · " : "") + (updated ? updated + "건 갱신" : "") + "되었습니다.");
        render();
        driveSaveSnapshot(null, true);
      }
    }).catch(syncChunkFailure("브랜드전략")).then(finish);
  }

  function mergeMarketResearchChunksIfNeeded(onDone) {
    // 🔎 시장조사담당이 실제로 조사한 결과를 작은 청크 파일(ahj_marketresearch_chunk_*.json,
    // 시장조사 항목 객체 배열)로 올리면 여기서 병합한다. 같은 id가 있으면 최신 내용으로 갱신한다.
    function finish() { if (onDone) onDone(); }
    if (!window.claude || !window.claude.mcp) { finish(); return; }
    var processed = state.meta.processedMarketResearchChunkIds || {};
    resolveDriveFolder().then(function (folderId) {
      var query = "title contains '" + DRIVE_MARKET_RESEARCH_CHUNK_PREFIX + "'";
      if (folderId) query += " and parentId = '" + folderId + "'";
      return driveSearchAllFiles(query);
    }).then(function (files) {
      files = files.filter(function (f) { return f.title && f.title.indexOf(DRIVE_MARKET_RESEARCH_CHUNK_PREFIX) === 0; });
      var pending = files.filter(function (f) { return !processed[f.id]; });
      if (!pending.length) return null;
      var chain = Promise.resolve([]);
      pending.forEach(function (f) {
        chain = chain.then(function (acc) {
          return window.claude.mcp.callTool(DRIVE_SERVER, "download_file_content", { fileId: f.id }).then(function (dl) {
            processed[f.id] = true;
            var b64 = dl.payload && dl.payload.content;
            if (!b64) return acc;
            var arr = JSON.parse(base64ToUtf8(b64));
            return acc.concat(arr);
          }).catch(function () { return acc; }); // 받다가 실패한 파일은 처리됨으로 찍지 않는다 — 다음에 다시 받는다
        });
      });
      return chain;
    }).then(function (items) {
      if (!items) return;
      var added = 0, updated = 0;
      items.forEach(function (r) {
        if (!r.id) r.id = uid();
        var existing = state.marketResearch.find(function (x) { return x.id === r.id; });
        if (existing) { Object.keys(r).forEach(function (k) { existing[k] = r[k]; }); updated++; }
        else { state.marketResearch.push(r); added++; }
      });
      state.meta.processedMarketResearchChunkIds = processed;
      persistLocal();
      if (added || updated) {
        notifySync("☁ 시장조사 " + (added ? added + "건 추가" : "") + (added && updated ? " · " : "") + (updated ? updated + "건 갱신" : "") + "되었습니다.");
        render();
        driveSaveSnapshot(null, true);
      }
    }).catch(syncChunkFailure("시장조사")).then(finish);
  }

  function mergeContentIdeaChunksIfNeeded(onDone) {
    // 💡 콘텐츠기획담당이 실제로 만든 기획안을 작은 청크 파일(ahj_contentidea_chunk_*.json,
    // 콘텐츠 아이디어 항목 객체 배열)로 올리면 여기서 병합한다. 같은 id가 있으면 최신 내용으로 갱신한다.
    function finish() { if (onDone) onDone(); }
    if (!window.claude || !window.claude.mcp) { finish(); return; }
    var processed = state.meta.processedContentIdeaChunkIds || {};
    resolveDriveFolder().then(function (folderId) {
      var query = "title contains '" + DRIVE_CONTENT_IDEA_CHUNK_PREFIX + "'";
      if (folderId) query += " and parentId = '" + folderId + "'";
      return driveSearchAllFiles(query);
    }).then(function (files) {
      files = files.filter(function (f) { return f.title && f.title.indexOf(DRIVE_CONTENT_IDEA_CHUNK_PREFIX) === 0; });
      var pending = files.filter(function (f) { return !processed[f.id]; });
      if (!pending.length) return null;
      var chain = Promise.resolve([]);
      pending.forEach(function (f) {
        chain = chain.then(function (acc) {
          return window.claude.mcp.callTool(DRIVE_SERVER, "download_file_content", { fileId: f.id }).then(function (dl) {
            processed[f.id] = true;
            var b64 = dl.payload && dl.payload.content;
            if (!b64) return acc;
            var arr = JSON.parse(base64ToUtf8(b64));
            return acc.concat(arr);
          }).catch(function () { return acc; }); // 받다가 실패한 파일은 처리됨으로 찍지 않는다 — 다음에 다시 받는다
        });
      });
      return chain;
    }).then(function (items) {
      if (!items) return;
      var added = 0, updated = 0;
      items.forEach(function (c) {
        if (!c.id) c.id = uid();
        var existing = state.contentIdeas.find(function (x) { return x.id === c.id; });
        if (existing) { Object.keys(c).forEach(function (k) { existing[k] = c[k]; }); updated++; }
        else { state.contentIdeas.push(c); added++; }
      });
      state.meta.processedContentIdeaChunkIds = processed;
      persistLocal();
      if (added || updated) {
        notifySync("☁ 콘텐츠 아이디어 " + (added ? added + "건 추가" : "") + (added && updated ? " · " : "") + (updated ? updated + "건 갱신" : "") + "되었습니다.");
        render();
        driveSaveSnapshot(null, true);
      }
    }).catch(syncChunkFailure("콘텐츠 기획")).then(finish);
  }

  function mergeCarouselChunksIfNeeded(onDone) {
    // 이미지구성팀이 만든 인스타그램 캐러셀 초안(HTML+구성안)을 작은 청크 파일
    // (ahj_carousel_chunk_*.json, 캐러셀 초안 객체 배열)로 올리면 여기서 병합한다.
    // 같은 id가 이미 있으면 최신 내용으로 갱신(재작업 반영)하고, 없으면 새로 추가한다.
    function finish() { if (onDone) onDone(); }
    if (!window.claude || !window.claude.mcp) { finish(); return; }
    var processed = state.meta.processedCarouselChunkIds || {};
    resolveDriveFolder().then(function (folderId) {
      var query = "title contains '" + DRIVE_CAROUSEL_CHUNK_PREFIX + "'";
      if (folderId) query += " and parentId = '" + folderId + "'";
      return driveSearchAllFiles(query);
    }).then(function (files) {
      files = files.filter(function (f) { return f.title && f.title.indexOf(DRIVE_CAROUSEL_CHUNK_PREFIX) === 0; });
      var pending = files.filter(function (f) { return !processed[f.id]; });
      if (!pending.length) return null;
      var chain = Promise.resolve([]);
      pending.forEach(function (f) {
        chain = chain.then(function (acc) {
          return window.claude.mcp.callTool(DRIVE_SERVER, "download_file_content", { fileId: f.id }).then(function (dl) {
            processed[f.id] = true;
            var b64 = dl.payload && dl.payload.content;
            if (!b64) return acc;
            var arr = JSON.parse(base64ToUtf8(b64));
            return acc.concat(arr);
          }).catch(function () { return acc; }); // 받다가 실패한 파일은 처리됨으로 찍지 않는다 — 다음에 다시 받는다
        });
      });
      return chain;
    }).then(function (items) {
      if (!items) return;
      var added = 0, updated = 0;
      items.forEach(function (draft) {
        if (!draft.id) draft.id = uid();
        var existing = state.carouselDrafts.find(function (x) { return x.id === draft.id; });
        if (existing) {
          Object.keys(draft).forEach(function (k) { existing[k] = draft[k]; });
          updated++;
        } else {
          state.carouselDrafts.push(draft);
          added++;
        }
      });
      state.meta.processedCarouselChunkIds = processed;
      persistLocal();
      if (added || updated) {
        var msg = "☁ 캐러셀 초안 ";
        if (added) msg += added + "건 추가";
        if (added && updated) msg += " · ";
        if (updated) msg += updated + "건 갱신";
        notifySync(msg + "되었습니다.");
        render();
        driveSaveSnapshot(null, true);
      }
    }).catch(syncChunkFailure("인스타 캐러셀")).then(finish);
  }

  /* ── 같은 사건을 한 장으로 ─────────────────────────────────────
     현황판은 사건번호에 "물건1" 꼬리를 붙여 보내고, 대리님이 손으로 만든 카드에는
     꼬리가 없다. 글자로만 맞추다 보니 같은 사건이 카드 두 장으로 갈라져,
     한쪽에는 권리분석 메모가 · 다른 쪽에는 최신 결과가 따로 쌓였다(7건).
     사건번호 + 물건번호로 키를 만들어 한 장으로 합친다. 꼬리가 없으면 물건1로 본다. */
  function marketCaseKey(caseNumber) {
    var t = String(caseNumber || "").trim();
    var c = t.match(/(20\d\d)\s*타경\s*(\d+)/);
    if (!c) return t.toLowerCase();
    var n = t.match(/물건\s*(\d+)|\((\d+)\)/);
    return c[1] + "타경" + String(Number(c[2])) + "#" + (n ? Number(n[1] || n[2]) : 1);
  }

  // 결과가 확정된 상태. 이걸 중간 상태(매각·유찰·조사중)로 되돌리면 안 된다.
  var MARKET_STATUS_FINAL = { "매각종료": true, "낙찰": true, "패찰": true, "취하": true };
  // v84: 상태의 "진행 정도". 현황판이 같은 사건을 '물건1' 꼬리로 다시 보내면서 status 를 조사중으로 보내
  // 대시보드의 변경·입찰예정을 되돌린 사고(2026-09-21, 8824·8801·1098·3134)를 막는다.
  // 들어온 상태가 기존보다 덜 진행된 것이면 무시한다. 같은 단계끼리(변경↔입찰예정↔유찰)는 바꿔도 된다 —
  // 법원 대조 결과가 그 사이를 오가기 때문이다. 확정 상태(FINAL)는 그 위 단계다.
  // 낙찰·패찰은 대리님이 직접 정하는 값이라 맨 위 — 청크가 매각종료로 덮지 못한다.
  var MARKET_STATUS_RANK = { "조사중": 0, "입찰예정": 1, "변경": 1, "유찰": 1, "매각": 2, "매각종료": 3, "취하": 3, "낙찰": 4, "패찰": 4 };
  function marketStatusRank(st) { return MARKET_STATUS_RANK[st] === undefined ? 0 : MARKET_STATUS_RANK[st]; }

  /* v85 (2026-09-22 대리님 지시): 현황판이 자동으로 골라 보내는 물건(⭐ 대장 단지 자동 등록)은
     매각기일이 오늘부터 2주 안에 드는 것만 데일리 경매분석에 새 카드로 올린다.
     그 밖의 것은 state.meta.pendingMarketAdds 에 넣어 두었다가, 날짜가 2주 안으로 들어오면
     그때 자동으로 올린다. 기일이 이미 지난 것은 올리지 않는다. 기일이 비어 있으면(미정) 대기.
     대리님이 현황판에서 "권리분석보내기"를 체크한 물건과 손으로 만든 청크는 이 제한을 받지 않는다.
     이미 대시보드에 있는 카드의 갱신(결과·기일 변경)도 제한하지 않는다. */
  var MARKET_AUTO_ADD_WINDOW_DAYS = 14;
  function isBoardAutoRegistration(m) {
    var memo = String((m && m.memo) || "");
    if (memo.indexOf("권리분석보내기") !== -1) return false;
    return memo.indexOf("자동 등록") !== -1;
  }
  // 국민평형 기준 (2026-09-22 대리님 지시): 전용 84㎡·34~36평형이 투자자 수요의 중심이고 대형평형은 인기가 없다.
  // 전용면적을 알 수 있을 때만 판정한다 — 현황판 청크의 exclusiveArea(㎡) 또는 메모의 "전용 NN㎡". 모르면 통과.
  var MARKET_AUTO_MAX_AREA = 95;
  // 대리님이 지운(또는 대형평형이라 뺀) 현황판 자동 등록 물건은 현황판이 다시 보내도 되살리지 않는다.
  // state.meta.marketDeletedKeys = { "<사건키>": "YYYY-MM-DD" }. 120일 지나면 잊는다.
  // 2026-09-22 정리분(대형평형 4건)은 코드에도 적어 둔다 — 삭제 패치보다 현황판 재전송이 먼저 와도 되살아나지 않게.
  var MARKET_AUTO_EXCLUDED_SEED = { "2025타경7975#1": "포스코더샵 전용 151㎡", "2026타경600574#1": "반석마을2단지 전용 150㎡", "2026타경132#1": "금성백조예미지 전용 101㎡", "2025타경1124#1": "동탄파크자이 전용 99.7㎡" };
  function rememberMarketDeleted(caseNumber) {
    var key = caseNumber && marketCaseKey(caseNumber);
    if (!key) return;
    if (!state.meta.marketDeletedKeys) state.meta.marketDeletedKeys = {};
    state.meta.marketDeletedKeys[key] = todayStr();
  }
  function isMarketKeyExcluded(key) {
    if (!key) return false;
    if (MARKET_AUTO_EXCLUDED_SEED[key]) return true;
    var d = state.meta.marketDeletedKeys && state.meta.marketDeletedKeys[key];
    if (!d) return false;
    if ((Date.now() - parseYMD(d).getTime()) > 120 * 86400000) { delete state.meta.marketDeletedKeys[key]; return false; }
    return true;
  }   // 전용 ㎡. 84형(공급 34평)~36평형(전용 약 90)까지 포함, 40평대(전용 100 이상)는 대형으로 본다
  function marketExclusiveArea(m) {
    if (!m) return 0;
    var a = Number(m.exclusiveArea || m.area || 0);
    if (a > 0) return a;
    var t = String(m.memo || "") + " " + String(m.address || "");
    var c = t.match(/전용\s*(\d+(?:\.\d+)?)\s*㎡/) || t.match(/(\d+(?:\.\d+)?)\s*㎡/);
    return c ? Number(c[1]) : 0;
  }
  // "add"(지금 올림) / "wait"(아직 2주 밖·기일 미정) / "drop"(기일이 지났음) / "large"(대형평형)
  function marketAutoAddDecision(m, today) {
    var ar = marketExclusiveArea(m);
    if (ar > MARKET_AUTO_MAX_AREA) return "large";
    var sd = String((m && m.saleDate) || "").slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(sd)) return "wait";
    var t = parseYMD(today || todayStr()), d = parseYMD(sd);
    var diff = Math.round((d.getTime() - t.getTime()) / 86400000);
    if (diff < 0) return "drop";
    return diff <= MARKET_AUTO_ADD_WINDOW_DAYS ? "add" : "wait";
  }

  function mergeMarketMemo(oldMemo, newMemo) {
    var a = String(oldMemo || "").trim(), b = String(newMemo || "").trim();
    if (!b) return a;
    if (!a) return b;
    if (a.indexOf(b) !== -1) return a;   // 이미 들어 있다
    if (b.indexOf(a) !== -1) return b;   // 새 글이 옛 글을 품고 있다(내 결과 청크)
    return a + " · " + b;                // 서로 다른 내용이면 붙인다 — 지우지 않는다
  }

  // 들어온 조각을 기존 카드에 얹는다. 빈 값으로 덮어써 지우거나,
  // 확정된 결과를 중간 상태로 되돌리는 일이 없게 한다.
  function applyMarketChunkFields(existing, incoming) {
    Object.keys(incoming).forEach(function (k) {
      if (k === "id" || k === "caseNumber") return;   // 식별자와 표기는 기존 것을 지킨다
      var v = incoming[k];
      if (k === "memo") { existing.memo = mergeMarketMemo(existing.memo, v); return; }
      if (k === "status") {
        if (!v) return;
        if (MARKET_STATUS_FINAL[existing.status] && !MARKET_STATUS_FINAL[v]) return;
        if (marketStatusRank(v) < marketStatusRank(existing.status)) return;   // 덜 진행된 상태로 되돌리지 않는다
        existing.status = v;
        return;
      }
      // 유찰 횟수는 줄어들지 않는다 — 재등록 카드가 낮은 값을 들고 와도 기존 값을 지킨다
      if (k === "failCount") {
        var fc = Number(v) || 0;
        if (fc > (Number(existing.failCount) || 0)) existing.failCount = fc;
        return;
      }
      if (k === "analysisWritten") { if (v) existing.analysisWritten = true; return; }
      // 0·빈 문자열로 기존 값을 지우지 않는다 (현황판은 낙찰가를 0으로 보낸다)
      if (v === 0 || v === "" || v === null || v === undefined) return;
      existing[k] = v;
    });
    existing.updatedAt = new Date().toISOString();
  }

  function mergeMarketChunksIfNeeded(onDone) {
    // 대리님이 채팅으로 보내주신 경매 물건 PDF(탱크옥션 물건상세정보 등)를 직접 읽고 분석해서,
    // 작은 청크 파일(ahj_market_chunk_*.json)로 데일리 경매분석에 등록한다. 같은 사건번호
    // (caseNumber)가 이미 있으면 최신 정보로 갱신하고, 없으면 새로 추가한다.
    function finish() { if (onDone) onDone(); }
    if (!window.claude || !window.claude.mcp) { finish(); return; }
    var processed = state.meta.processedMarketChunkIds || {};
    resolveDriveFolder().then(function (folderId) {
      var query = "title contains '" + DRIVE_MARKET_CHUNK_PREFIX + "'";
      if (folderId) query += " and parentId = '" + folderId + "'";
      return driveSearchAllFiles(query);
    }).then(function (files) {
      files = files.filter(function (f) { return f.title && f.title.indexOf(DRIVE_MARKET_CHUNK_PREFIX) === 0; });
      var pending = files.filter(function (f) { return !processed[f.id]; });
      if (!pending.length) return null;
      var chain = Promise.resolve([]);
      pending.forEach(function (f) {
        chain = chain.then(function (acc) {
          return window.claude.mcp.callTool(DRIVE_SERVER, "download_file_content", { fileId: f.id }).then(function (dl) {
            processed[f.id] = true;
            var b64 = dl.payload && dl.payload.content;
            if (!b64) return acc;
            var arr = JSON.parse(base64ToUtf8(b64));
            return acc.concat(arr);
          }).catch(function () { return acc; }); // 받다가 실패한 파일은 처리됨으로 찍지 않는다 — 다음에 다시 받는다
        });
      });
      return chain;
    }).then(function (items) {
      if (!items) return;
      // 지난번에 짝(카드)을 못 찾아 미뤄 둔 결과 줄을 앞에 붙인다. 카드보다 결과가 먼저 도착하면
      // 결과가 버려지는 일이 있었다(2025타경9339 — 유찰 결과가 카드 생성 청크와 같은 배치에 오면 빈 껍데기 방지에 걸려 사라짐).
      items = (state.meta.pendingMarketPatches || []).concat(items);
      // v85: 2주 밖이라 기다리던 자동 등록 물건도 다시 판정한다(기일이 2주 안으로 들어왔는지).
      items = (state.meta.pendingMarketAdds || []).concat(items);
      // 카드를 만드는 줄(date·단지명·주소가 있는 것)을 먼저 적용하고, 결과만 담긴 줄은 그 뒤에 적용한다.
      // Drive 검색 순서는 날짜순이 아니라서 같은 배치 안에서도 순서를 믿을 수 없다.
      var isFull = function (m) { return !!(m.date || m.buildingName || m.address); };
      var ordered = items.filter(isFull).concat(items.filter(function (m) { return !isFull(m); }));
      var added = 0, updated = 0, deferred = [], waiting = [], waitingNew = 0, dropped = 0, large = 0, excluded = 0;
      var today = todayStr();
      ordered.forEach(function (m) {
        var key = m.caseNumber && marketCaseKey(m.caseNumber);
        var existing = key && state.marketAuctions.find(function (x) { return marketCaseKey(x.caseNumber) === key; });
        if (existing) {
          applyMarketChunkFields(existing, m);
          updated++;
        } else if (isFull(m) && isMarketKeyExcluded(key) && isBoardAutoRegistration(m)) {
          excluded++;   // 대리님이 지운 물건 — 현황판이 다시 보내도 올리지 않는다
        } else if (isFull(m) && isBoardAutoRegistration(m) && marketAutoAddDecision(m, today) !== "add") {
          // 현황판 자동 등록인데 매각기일이 2주 밖(또는 미정)이다 — 지금은 올리지 않고 기다린다.
          var dec = marketAutoAddDecision(m, today);
          if (dec === "drop") { dropped++; return; }
          if (dec === "large") { large++; return; }   // 대형평형 — 올리지 않고 기다리지도 않는다
          var w = key && waiting.find(function (x) { return marketCaseKey(x.caseNumber) === key; });
          if (w) { applyMarketChunkFields(w, m); }
          else {
            if (!m.waitingSince) { m.waitingSince = today; waitingNew++; }
            waiting.push(m);
          }
        } else if (isFull(m)) {
          if (!m.id) m.id = uid();
          delete m.waitingSince;
          if (key && state.meta.marketDeletedKeys) delete state.meta.marketDeletedKeys[key];   // 권리분석보내기·수동 등록은 대리님 뜻이니 차단을 푼다
          state.marketAuctions.push(m);
          added++;
        } else if (key && waiting.some(function (x) { return marketCaseKey(x.caseNumber) === key; })) {
          // v85: 2주 밖이라 기다리는 물건의 결과(기일 변경·유찰 등)는 대기 항목에 얹어 둔다 — 올라올 때 최신 상태로 올라오게.
          applyMarketChunkFields(waiting.find(function (x) { return marketCaseKey(x.caseNumber) === key; }), m);
        } else if (key) {
          // 결과만 있는데 카드가 아직 없다 — 버리지 말고 다음 병합 때 다시 맞춰 본다.
          // 너무 오래 묵은 것(30일)은 대시보드에서 지운 물건일 테니 그때 놓아준다.
          var age = Date.now() - new Date(m.updatedAt || Date.now()).getTime();
          if (age < 30 * 86400000) deferred.push(m);
        }
      });
      state.meta.pendingMarketPatches = deferred;
      // 대기 목록: 기다린 지 90일이 넘은 것은 놓아준다(기일이 계속 미정이거나 현황판에서 빠진 물건).
      state.meta.pendingMarketAdds = waiting.filter(function (m) {
        if (marketExclusiveArea(m) > MARKET_AUTO_MAX_AREA) return false;   // 기다리는 사이 면적이 들어와 대형으로 판명
        var since = parseYMD(m.waitingSince || today);
        return (Date.now() - since.getTime()) < 90 * 86400000;
      });
      state.meta.processedMarketChunkIds = processed;
      persistLocal();
      if (added || updated || waitingNew || dropped || large || excluded) {
        var parts = [];
        if (added) parts.push(added + "건 추가");
        if (updated) parts.push(updated + "건 갱신");
        if (waitingNew) parts.push(waitingNew + "건은 매각기일 2주 밖이라 대기");
        if (dropped) parts.push(dropped + "건은 기일이 지나 제외");
        if (large) parts.push(large + "건은 대형평형(전용 " + MARKET_AUTO_MAX_AREA + "㎡ 초과)이라 제외");
        if (excluded) parts.push(excluded + "건은 지운 물건이라 제외");
        notifySync("☁ 경매 물건 " + parts.join(" · ") + (added || updated ? "되었습니다." : "."));
        render();
        if (added || updated) driveSaveSnapshot(null, true);
      }
    }).catch(syncChunkFailure("경매 물건")).then(finish);
  }

  function cleanupStudentDbLinkMemoIfNeeded() {
    // one-time cleanup: earlier versions auto-built a long "수강형태 / 수업시간 / 메모" string
    // into linked students' memo, which rendered unreadably. New links never set memo, so any
    // studentDbId-linked student still carrying a memo here is leftover from that old behavior.
    if (state.meta.studentDbMemoCleanupV1) return;
    var changed = false;
    state.students.forEach(function (s) {
      if (s.studentDbId && s.memo) { s.memo = ""; changed = true; }
    });
    state.meta.studentDbMemoCleanupV1 = true;
    persistLocal();
    if (changed) { render(); driveSaveSnapshot(null, true); }
  }

  function courseKeyForLevel(level) {
    if (level === "초급반") return "basic";
    if (level === "중급반") return "intermediate";
    if (level === "고급반(오프라인)" || level === "고급반(온라인)") return "advanced";
    if (level === "컨설팅반") return "consulting";
    return null; // 낙찰반 등 DB 수강과정 체크박스와 매칭되는 항목이 없는 반
  }

  function backfillStudentDbLinksIfNeeded() {
    // 수강생 DB가 메인이 되기 전(은행거래내역 직접추가/수동입력 등)에 만들어진 수강생 · 매출
    // 레코드는 studentDbId가 없어 DB와 연동되지 않는다. 그런 기존 레코드마다 DB 항목을
    // 하나씩 만들어 소급으로 연결한다.
    if (state.meta.studentDbBackfillV1) return;
    var changed = false;
    state.students.forEach(function (s) {
      if (s.studentDbId) return;
      var dbId = uid();
      var courses = {};
      var ck = courseKeyForLevel(s.level);
      if (ck) courses[ck] = true;
      var paid = s.paymentType === "월별" ? (s.installments || []).some(function (i) { return i.paid; }) : !!s.paid;
      state.studentDb.push({
        id: dbId, name: s.name, phone: null, registeredDate: s.appliedDate || null, courses: courses,
        amount: s.paymentType === "월별" ? null : (s.tuition || null), courseType: null, classTime: null,
        paymentStatus: paid ? "입금완료" : null, paymentDate: s.paidDate || null,
        cashReceipt: null, memo: "수강생 · 매출 실적에서 소급 연동", linkedStudentId: s.id
      });
      s.studentDbId = dbId;
      changed = true;
    });
    state.meta.studentDbBackfillV1 = true;
    persistLocal();
    if (changed) { render(); driveSaveSnapshot(null, true); }
  }

  function syncStudentDbConsultingFlag(student) {
    // 수강생·매출 탭에서 반을 "컨설팅반"으로 설정하면, 연동된 수강생 DB 항목의
    // 수강과정 체크박스에도 "컨설팅"을 자동으로 켜준다(수동 체크를 깜빡해 DB 집계가
    // 실제 등록 현황과 어긋나는 걸 막기 위함). 반대로 컨설팅반이 아니게 바뀌어도
    // 이미 켜둔 체크는 임의로 끄지 않는다 - 다른 이유로 수동 체크됐을 수 있어서다.
    if (!student || student.level !== "컨설팅반" || !student.studentDbId) return;
    var db = state.studentDb.find(function (d) { return d.id === student.studentDbId; });
    if (!db) return;
    db.courses = db.courses || {};
    if (!db.courses.consulting) db.courses.consulting = true;
  }

  function backfillConsultingCourseFlagIfNeeded() {
    if (state.meta.consultingCourseFlagBackfillV1) return;
    var before = JSON.stringify(state.studentDb);
    state.students.forEach(function (s) { syncStudentDbConsultingFlag(s); });
    var changed = JSON.stringify(state.studentDb) !== before;
    state.meta.consultingCourseFlagBackfillV1 = true;
    persistLocal();
    if (changed) { render(); driveSaveSnapshot(null, true); }
  }

  function backfillStudentPaidDateIfNeeded() {
    // 확정 매출은 신청일이 아니라 실제 입금일(은행 거래 날짜) 기준으로 집계되어야 하는데,
    // 이 필드가 생기기 전에 이미 연동된 건들은 paidDate가 비어있다 -- 은행 거래내역에서
    // 역으로 실제 입금 날짜를 찾아 채워 넣는다.
    if (state.meta.paidDateBackfillV1) return;
    var changed = false;
    state.transactions.forEach(function (t) {
      if (t.category !== "tuition") return;
      if (t.studentId && !t.installmentId) {
        var st = state.students.find(function (s) { return s.id === t.studentId; });
        if (st && st.paymentType !== "월별" && !st.paidDate) { st.paidDate = t.date; changed = true; }
      }
      (t.studentLinks || []).forEach(function (l) {
        if (l.installmentId) return;
        var st2 = state.students.find(function (s) { return s.id === l.studentId; });
        if (st2 && st2.paymentType !== "월별" && !st2.paidDate) { st2.paidDate = t.date; changed = true; }
      });
    });
    state.meta.paidDateBackfillV1 = true;
    persistLocal();
    if (changed) { render(); driveSaveSnapshot(null, true); }
  }

  function addJulyRosterIfNeeded() {
    // 7월 초급반 체험단(블로거 유입) + 신규 명단을 한 번만 등록한다. 수강료는 0원(체험),
    // 신규유입 집계에는 잡히도록 등록일만 7월로 넣는다.
    if (state.meta.julyRosterAddedV1) return;
    var REG_DATE = "2026-07-01";
    var newBloggers = [
      ["이충영", "010-8353-6848"], ["이다영", "010-3726-2475"], ["허준열", "010-2686-5270"],
      ["이유미", "010-8955-4383"], ["한우탁", "010-2554-3494"], ["이광희", "010-4064-0207"],
      ["송은주", "010-9773-6005"], ["이혜경", "010-7358-7565"], ["이혜경", "010-3906-0222"]
    ];
    var changed = false;
    newBloggers.forEach(function (pair) {
      var name = pair[0], phone = pair[1];
      var exists = state.studentDb.some(function (d) { return d.name === name && d.phone === phone; });
      if (exists) return;
      var courses = {}; STUDENT_DB_COURSE_KEYS.forEach(function (k) { courses[k] = k === "basic"; });
      var dbId = uid();
      state.studentDb.push({
        id: dbId, name: name, phone: phone, registeredDate: REG_DATE, courses: courses,
        amount: 0, courseType: "", classTime: "", paymentStatus: "", paymentDate: "", memo: ""
      });
      var newId = uid();
      state.students.push({
        id: newId, name: name, level: STUDENT_LEVELS[0], appliedDate: REG_DATE,
        status: "등록완료", paymentType: "단발성",
        tuition: 0, paid: false, taxInvoice: false, cardPayment: false,
        monthlyAmount: 0, installments: [], memo: "", studentDbId: dbId
      });
      state.studentDb[state.studentDb.length - 1].linkedStudentId = newId;
      changed = true;
    });

    var kimHyunA = state.studentDb.find(function (d) { return d.name === "김현아" && d.phone === "010-4024-9095"; });
    if (kimHyunA && !kimHyunA.linkedStudentId) {
      kimHyunA.registeredDate = REG_DATE;
      kimHyunA.courses = kimHyunA.courses || {};
      kimHyunA.courses.basic = true;
      var newId2 = uid();
      state.students.push({
        id: newId2, name: kimHyunA.name, level: STUDENT_LEVELS[0], appliedDate: REG_DATE,
        status: "등록완료", paymentType: "단발성",
        tuition: 0, paid: false, taxInvoice: false, cardPayment: false,
        monthlyAmount: 0, installments: [], memo: "", studentDbId: kimHyunA.id
      });
      kimHyunA.linkedStudentId = newId2;
      changed = true;
    }

    ["최혜지", "김선영"].forEach(function (nm) {
      var st = state.students.find(function (s) { return s.name === nm; });
      if (st && st.level !== "중급반") { st.level = "중급반"; changed = true; }
    });

    state.meta.julyRosterAddedV1 = true;
    persistLocal();
    if (changed) { render(); driveSaveSnapshot(null, true); }
  }

  function enforceDepositBasedRevenueV1() {
    // 매출은 신청일/회차가 아니라 실제 입금(은행거래) 날짜 기준으로 잡혀야 한다.
    // 2026년 수강료 거래에 연결된 모든 단발성 학생의 paidDate, 월별 회차의 해당월을
    // 연결된 은행거래의 실제 날짜로 강제 정정한다 (기존 값이 있어도 덮어씀).
    if (state.meta.depositBasedRevenueFixV1) return;
    var changed = false;
    function applyDepositDate(studentId, installmentId, date) {
      var st = state.students.find(function (s) { return s.id === studentId; });
      if (!st) return;
      if (installmentId) {
        var inst = (st.installments || []).find(function (i) { return i.id === installmentId; });
        var mk = date.slice(0, 7);
        if (inst && inst.month !== mk) { inst.month = mk; changed = true; }
      } else if (st.paymentType !== "월별") {
        if (st.paidDate !== date) { st.paidDate = date; changed = true; }
      }
    }
    state.transactions.forEach(function (t) {
      if (t.category !== "tuition") return;
      if (!t.date || t.date.slice(0, 4) !== "2026") return;
      if (t.studentId) applyDepositDate(t.studentId, t.installmentId, t.date);
      (t.studentLinks || []).forEach(function (l) { applyDepositDate(l.studentId, l.installmentId, t.date); });
    });
    state.meta.depositBasedRevenueFixV1 = true;
    persistLocal();
    if (changed) { render(); driveSaveSnapshot(null, true); }
  }

  function tuitionLinksForStudent(sid) {
    // 2026년 수강료 거래 중 이 학생이 걸려있는 모든 건을 링크 형태(단일 studentId / 복수 studentLinks)
    // 상관없이 한 목록으로 모은다.
    var out = [];
    state.transactions.forEach(function (t) {
      if (t.category !== "tuition") return;
      if (!t.date || t.date.slice(0, 4) !== "2026") return;
      var links = (t.studentLinks && t.studentLinks.length) ? t.studentLinks : (t.studentId ? [{ studentId: t.studentId, installmentId: t.installmentId }] : []);
      var mine = links.filter(function (l) { return l.studentId === sid; });
      if (!mine.length) return;
      out.push({ tx: t, installmentId: mine[0].installmentId, linkCountInTx: links.length, viaStudentLinks: !!(t.studentLinks && t.studentLinks.length) });
    });
    return out;
  }
  function setInstallmentIdOnLink(entry, sid, instId) {
    if (entry.viaStudentLinks) {
      var sl = (entry.tx.studentLinks || []).find(function (x) { return x.studentId === sid; });
      if (sl) sl.installmentId = instId;
    } else {
      entry.tx.installmentId = instId;
    }
  }

  function fixRecurringLumpSumStudentsV1() {
    // 아래 학생들은 "단발성"으로 등록돼 있지만 실제로는 은행에 여러 번(월별로) 나눠 입금해왔다.
    // 단발성은 금액/입금일을 하나만 가질 수 있어서 최근 입금 건 말고는 매출에서 계속 누락되고 있었다.
    // 실제로 2건 이상(단일/복수 연동 형태 모두 포함) 연결된 건들만 회차별 월별 결제로 전환하고,
    // 각 회차 금액은 그 회차에 실제로 연결된 은행거래 입금액을 그대로 사용한다(임의 분배 없음).
    if (state.meta.recurringLumpSumFixV1) return;
    var targetIds = [
      "idms4acux63357uc", "idms4acqznh51yp5", "idmsfchk2e48hg6f",
      "idms4acnwe1jgj3w", "idmsfcjvzofmuno6", "idms4adunl3rjctj"
    ];
    var changed = false;
    targetIds.forEach(function (sid) {
      var st = state.students.find(function (s) { return s.id === sid; });
      if (!st || st.paymentType === "월별") return;
      var entries = tuitionLinksForStudent(sid).filter(function (e) { return !e.installmentId && e.linkCountInTx === 1; });
      if (entries.length < 2) return;
      entries.sort(function (a, b) { return a.tx.date.localeCompare(b.tx.date); });
      st.paymentType = "월별";
      st.installments = entries.map(function (e, idx) {
        var inst = { id: uid(), round: idx + 1, month: e.tx.date.slice(0, 7), amount: e.tx.deposit, paid: true, taxInvoice: false, cardPayment: false };
        setInstallmentIdOnLink(e, sid, inst.id);
        return inst;
      });
      st.monthlyAmount = entries[entries.length - 1].tx.deposit;
      st.tuition = 0;
      st.paid = false;
      st.paidDate = null;
      changed = true;
    });
    state.meta.recurringLumpSumFixV1 = true;
    persistLocal();
    if (changed) { render(); driveSaveSnapshot(null, true); }
  }

  function fixSingleTransactionTuitionAmountsV1() {
    // 단발성 학생이 2026년에 은행거래 딱 한 건에만(그것도 그 건에 다른 사람과 묶이지 않고
    // 혼자만) 연결돼 있으면, 등록된 수강료를 그 실제 입금액과 정확히 일치시킨다.
    // 여러 건에 걸쳐 있거나 다른 사람과 함께 묶인 입금은 애매하므로 건드리지 않는다.
    if (state.meta.singleTxTuitionFixV1) return;
    var changed = false;
    state.students.forEach(function (st) {
      if (st.paymentType === "월별") return;
      var entries = tuitionLinksForStudent(st.id);
      if (entries.length !== 1) return;
      var e = entries[0];
      if (e.installmentId || e.linkCountInTx !== 1) return;
      if (st.tuition !== e.tx.deposit) { st.tuition = e.tx.deposit; changed = true; }
    });
    state.meta.singleTxTuitionFixV1 = true;
    persistLocal();
    if (changed) { render(); driveSaveSnapshot(null, true); }
  }

  function reconcileRemainingBundledTuitionV1() {
    // 카드사 정산 묶음 건 중 실제로 누가 얼마씩 냈는지 정확히 알 수 없는 건들은,
    // 등록된 금액 비율대로 나눠서 그 달 실제 입금 총액과 정확히 일치하도록 맞춘다.
    if (state.meta.bundledTuitionReconcileV1) return;
    var changed = false;

    function scaleParts(parts, targetTotal) {
      var sum = parts.reduce(function (s, p) { return s + p.amount; }, 0);
      if (!sum) return;
      var ratio = targetTotal / sum;
      var running = 0;
      parts.forEach(function (p, idx) {
        var amt = idx === parts.length - 1 ? targetTotal - running : Math.round((p.amount * ratio) / 10) * 10;
        if (idx !== parts.length - 1) running += amt;
        p.apply(amt);
      });
    }

    // 염재민 + 이호욱: 같은 카드사 정산 묶음으로 6월/7월 두 번 입금됐다 -- 월별로 전환하고
    // 각 회차 금액은 그 달 실제 입금 총액을 등록 금액 비율대로 나눠 채운다.
    var yeom = state.students.find(function (s) { return s.id === "idms49epoxr10sry"; });
    var lee = state.students.find(function (s) { return s.id === "idms49ep8lqs0jh1"; });
    if (yeom && lee && yeom.paymentType !== "월별" && lee.paymentType !== "월별") {
      var pairTx = state.transactions.filter(function (t) {
        return t.category === "tuition" && t.date && t.date.slice(0, 4) === "2026" &&
          t.studentLinks && t.studentLinks.length === 2 &&
          t.studentLinks.some(function (l) { return l.studentId === yeom.id; }) &&
          t.studentLinks.some(function (l) { return l.studentId === lee.id; });
      }).sort(function (a, b) { return a.date.localeCompare(b.date); });
      if (pairTx.length >= 2) {
        var yeomBase = yeom.tuition, leeBase = lee.tuition;
        yeom.paymentType = "월별"; lee.paymentType = "월별";
        yeom.installments = []; lee.installments = [];
        pairTx.forEach(function (t, idx) {
          var round = idx + 1, month = t.date.slice(0, 7);
          var yeomInst = { id: uid(), round: round, month: month, amount: 0, paid: true, taxInvoice: false, cardPayment: false };
          var leeInst = { id: uid(), round: round, month: month, amount: 0, paid: true, taxInvoice: false, cardPayment: false };
          scaleParts([
            { amount: yeomBase, apply: function (a) { yeomInst.amount = a; } },
            { amount: leeBase, apply: function (a) { leeInst.amount = a; } }
          ], t.deposit);
          yeom.installments.push(yeomInst);
          lee.installments.push(leeInst);
          var slYeom = t.studentLinks.find(function (l) { return l.studentId === yeom.id; });
          var slLee = t.studentLinks.find(function (l) { return l.studentId === lee.id; });
          slYeom.installmentId = yeomInst.id;
          slLee.installmentId = leeInst.id;
        });
        yeom.monthlyAmount = yeom.installments[yeom.installments.length - 1].amount;
        lee.monthlyAmount = lee.installments[lee.installments.length - 1].amount;
        yeom.tuition = 0; lee.tuition = 0;
        yeom.paid = false; lee.paid = false;
        yeom.paidDate = null; lee.paidDate = null;
        changed = true;
      }
    }

    // 김선영 + 최혜지: 7월 KB카드 정산 한 건에만 같이 묶여 있다 -- 등록 금액 비율대로
    // 실제 입금액에 맞춰 두 사람 수강료를 조정한다.
    var kim = state.students.find(function (s) { return s.id === "idmsff7wihfygcry"; });
    var choi = state.students.find(function (s) { return s.id === "idms49drkizekv7f"; });
    if (kim && choi && kim.paymentType !== "월별" && choi.paymentType !== "월별") {
      var kbTx = state.transactions.find(function (t) {
        return t.category === "tuition" && t.date === "2026-07-20" && t.description === "KB12105192" &&
          t.studentLinks && t.studentLinks.length === 2 &&
          t.studentLinks.some(function (l) { return l.studentId === kim.id; }) &&
          t.studentLinks.some(function (l) { return l.studentId === choi.id; });
      });
      if (kbTx) {
        var origKim = kim.tuition, origChoi = choi.tuition;
        scaleParts([
          { amount: origKim, apply: function (a) { kim.tuition = a; } },
          { amount: origChoi, apply: function (a) { choi.tuition = a; } }
        ], kbTx.deposit);
        changed = true;
      }
    }

    state.meta.bundledTuitionReconcileV1 = true;
    persistLocal();
    if (changed) { render(); driveSaveSnapshot(null, true); }
  }

  function clearMarketAuctionsOnceV1() {
    // 탱크옥션 엑셀 업로드로 새로 받아쓰기로 해서, 기존 수기 입력분을 한 번만 비운다.
    if (state.meta.marketAuctionsClearedV1) return;
    var changed = state.marketAuctions.length > 0;
    state.marketAuctions = [];
    state.meta.marketAuctionsClearedV1 = true;
    persistLocal();
    if (changed) { render(); driveSaveSnapshot(null, true); }
  }

  var AUG5_BULK_IMPORT_STUDENT_IDS = ["idmsfchk2e48hg6f","idmsg47l8q59xtb5","idmsg47lfxp0xbv9","idmsg47lpctmqfkp","idmsg47mguuy4y4s","idmsg47mz8j6f9tn","idmsg47n521c6uia","idmsg47nlal55usn","idmsg47ofzbmug0y","idmsg47ot1l2lge9","idmsg47ppukn0lcn","idmsg47qjvs0gyq3","idmsg47rd3gyr24f","idmsg47rivq7cm9r","idmsg47rppxlbnap","idmsg47rw5glv9x3","idmsg47s2rfh1v3w","idmsg47sy5y8iz7h","idmsg47t499r97ui","idmsg47tb2vqajiu","idmsg47ukrn1wbu8","idmsg47urar09exf","idmsg47v4wu4mv9r","idmsg47vdpwt0rfm","idmsg47vnu5osrqu","idmsg47wj1p1igu0","idmsg47wpukykep5","idmsg47wwb79t607","idmsg47xn1zkmaej","idmsg47xtt8pa2v5","idmsg47y1rsyg4au","idmsg47y9e9d447w","idmsg47ygjbm5drj","idmsg47yneat9sxw","idmsg47zcjdyemip","idmsg4802jqpyfg2","idmsg480815uwcwd","idmsg480exjtkqdt","idmsg480qd919r78","idmsg4817ajwp23c","idmsg481jokue4ty","idmsg481pwo1guz0","idmsg481vuej75mr","idmsg482z278oc08","idmsg48351lmdjgp","idmsg483nuhsltei","idmsg4840hgrbo82","idmsg48465wbsu4w","idmsg484vrkpt2ji","idmsg4852ijv89sw","idmsg4859bqrhg4l","idmsg485tqj7i6en","idmsg487e4wuf62r","idmsg487jffy7gh3","idmsg487wn1j1sk5","idmsg4882mtb5toi","idmsg488lfazcdjy","idmsg488ww5g828g","idmsg489rpoworo5","idmsg48agaky996r","idmsg48aun648tqa","idmsg48bk6va1nn6","idmsg48bqsyyu5cw","idmsg48bwgteccl4","idmsg48c4378tfwr","idmsg48crqhlg9d9","idmsg48dayzpzn15","idmsg48e9lc180u3","idmsg48fsl6xx9dy","idmsg48hfetue392","idmsg48hnjymlf4d","idmsg48ihj88nlsr","idmsg48ipi32hmrb","idmsg48j1cp7d8f9","idmsg48j8svfrpja","idmsg48jhcxk3uk0","idmsg48k8j7lns0e","idmsg48klq6ibv1b","idmsg48kw8vkpc7j","idmsg48l2bw1j4wn","idmsg48l8wh2lb2f","idmsg48mcsdjtc8w","idmsg48mmee2xwot","idmsg48nb88heypf","idmsg48ngxx6h8zq","idmsg48noijnn7dy","idmsg48oc8navomv","idmsg48oj4qnw2gh","idmsg48ot1i8efoh","idmsg48pp3yr3u85","idmsg48pv8gkomu0","idmsg48q879bkm2u","idmsg48qo62e60zq","idmsg48quevf40lp","idmsg48rin3zun0x","idmsg48rpock46m7","idmsg48soky3mls8","idmsg48susxle0k5","idmsg48t8nljdsag","idmsg48touyw4vg8","idmsg48tw5ulthnr","idmsg48u3ermowfw","idmsg48unqex3n5l","idmsg48uvha7j35k","idmsg48v2eovw5uw","idmsg48vsas5km7q","idmsg48vzvhpu0yv","idmsg48wskgluo2o","idmsg48x5vvz9tdh","idmsg48xfhsokzoa","idmsg48xn09zlhzf","idmsg48ycay50n67","idmsg48z3hwquu1t","idmsg48zc1fdrphm","idmsg48zjbyniaxk","idmsg490db6k2a3u","idmsg498oumucpxy","idmsg498vc6mzrkn"];

  function excludeBulkImportedStudentsFromNewCountV1() {
    // 2026-08-05에 기존 수강생 DB를 대량으로 옮겨 적으면서 appliedDate가 전부 그날로 찍힌 118명은
    // 실제로는 그 이전부터 다니던 기존 수강생이라, "이번달 신규 수강생" 집계에서 제외한다.
    // (appliedDate 자체는 실제 신청일을 알 수 없어 그대로 두고, KPI 집계에서만 체크 제외 처리)
    if (state.meta.aug5BulkImportExclusionV1) return;
    var exclusions = ensureKpiExclusions().newStudents;
    var changed = false;
    AUG5_BULK_IMPORT_STUDENT_IDS.forEach(function (id) {
      var key = "newstudent:" + id;
      if (!exclusions[key]) { exclusions[key] = true; changed = true; }
    });
    state.meta.aug5BulkImportExclusionV1 = true;
    persistLocal();
    if (changed) { render(); driveSaveSnapshot(null, true); }
  }

  // 대리님 요청으로 자료실에 부동산 경매 관련 대법원 판례·실무해설을 1회 채워 넣는다.
  // WebSearch로 실제 존재가 확인된 사건번호·출처만 담았고, 검색 결과에 판시 내용이 명확히
  // 나오지 않은 건은 "원문에서 확인 필요"로 남겨 추측으로 채우지 않았다.
  var CASELAW_SEED_RESOURCES = [
    {
      title: "대법원 2025.4.15. 선고 - 임차인 점유 상실 후 임차권등기의 대항력",
      category: "판례",
      url: "https://www.scourt.go.kr/portal/news/NewsViewAction.work?pageIndex=1&searchWord=&searchOption=&seqnum=10370&gubun=4&type=5",
      memo: "대항력을 취득한 주택 임차인이 점유를 상실하면 대항력이 소멸하고, 이후 임차권등기를 마치더라도 등기 시점부터 동일성 없는 새로운 대항력이 발생한다고 판시. (대법원 판례속보 원문)"
    },
    {
      title: "대법원 2022.12.29. 선고 - 경매개시결정 기입등기 후 유치권 취득자의 대항력",
      category: "판례",
      url: "https://www.scourt.go.kr/portal/news/NewsViewAction.work?pageIndex=1&seqnum=8997&gubun=4&type=0",
      memo: "경매개시결정 기입등기 이후에 유치권 성립요건을 갖춘 자가 경매절차의 매수인에게 유치권으로 대항할 수 있는지가 쟁점이 된 사건. 정확한 사건번호·판시 요지는 원문에서 확인 필요."
    },
    {
      title: "대법원 1999.4.16.자 98마3897 결정 - 부동산인도명령의 한계",
      category: "판례",
      url: "https://casenote.kr/%EB%8C%80%EB%B2%95%EC%9B%90/98%EB%A7%883897",
      memo: "부동산인도명령은 매수인(경락인)에게 실체상의 권리 이상을 부여하는 것이 아니므로, 채무자·소유자가 실체상 점유권원을 가지고 있는 경우에는 매수인의 인도명령 신청을 거절할 수 있다고 판시."
    },
    {
      title: "대법원 2013.11.14. 선고 2013다27831 판결 - 임차인 스스로 경매신청 시 배당요구",
      category: "판례",
      url: "https://casenote.kr/%EB%8C%80%EB%B2%95%EC%9B%90/2013%EB%8B%A427831",
      memo: "대항력·우선변제권을 모두 가진 임차인이 보증금반환청구 확정판결 등 집행권원으로 스스로 강제경매를 신청했다면, 우선변제권을 선택 행사한 것으로 보아 배당요구 종기까지 별도로 배당요구를 하지 않아도 우선변제를 받을 수 있다고 판시."
    },
    {
      title: "대법원 1998.10.13. 선고 98다12379 판결 - 배당요구 불이행과 부당이득반환청구",
      category: "판례",
      url: "https://casenote.kr/%EB%8C%80%EB%B2%95%EC%9B%90/98%EB%8B%A412379",
      memo: "배당요구 종기까지 배당요구를 하지 않아 배당에서 제외된 채권자는, 실체상 우선순위가 있더라도 배당을 받은 후순위채권자를 상대로 부당이득반환청구를 할 수 없다고 판시."
    },
    {
      title: "무상거주확인서와 신의칙(금반언) - 판례 흐름 정리",
      category: "판례",
      url: "http://www.lawtimes.co.kr/news/articleView.html?idxno=108016",
      memo: "담보권자 등에게 무상거주확인서를 작성·교부한 임차인이 경매절차에서 임대차관계를 밝히지 않았고 매수인이 이를 신뢰해 매수한 경우, 임차인이 매수인의 인도청구에 대항력을 주장하는 것은 신의칙(금반언)에 반해 허용되지 않는다는 취지의 판례 흐름을 다룬 법률신문 판례평석. 개별 사건번호·구체적 요건은 원문에서 확인 필요."
    },
    {
      title: "유치권의 성립요건(점유) 관련 쟁점 정리",
      category: "참고자료",
      url: "https://www.kci.go.kr/kciportal/landing/article.kci?arti_id=ART002118118",
      memo: "부동산경매절차상 유치권의 성립·대항력에 관한 쟁점을 정리한 학술논문. 점유(민법 320조)는 유치권의 성립·존속요건이며, 사회통념상 사실적 지배관계로 판단한다는 원칙을 다룸."
    },
    {
      title: "주택 경매와 무상거주확인서 - 변호사 칼럼",
      category: "참고자료",
      url: "https://m.joongdo.co.kr/view.php?key=20220615010003039",
      memo: "경매 실무에서 무상거주확인서가 왜, 어떻게 쓰이는지 초심자 관점에서 정리한 신문 칼럼. 컨설팅 시 고객 설명용으로 참고."
    }
  ];

  function seedCaselawResourcesV1() {
    if (state.meta.caselawResourcesSeededV1) return;
    CASELAW_SEED_RESOURCES.forEach(function (r) {
      state.resources.push({ id: uid(), title: r.title, category: r.category, url: r.url, memo: r.memo, createdAt: new Date().toISOString() });
    });
    state.meta.caselawResourcesSeededV1 = true;
    persistLocal();
    render();
    driveSaveSnapshot(null, true);
  }

  function cloudSyncStatusLabel() {
    if (!window.claude || !window.claude.mcp) return "☁ 이 화면에서는 클라우드 동기화를 쓸 수 없습니다";
    if (cloudSyncState === "syncing") return "☁ 동기화 중…";
    if (cloudSyncState === "error") return "☁ 동기화 오류 (자동 재시도 예정)";
    var lc = state.meta.lastCloudSync;
    return lc ? "☁ 마지막 동기화: " + new Date(lc).toLocaleString("ko-KR") : "☁ 아직 동기화되지 않음";
  }

  /* ---------------- Icons ---------------- */
  function svgWrap(inner) {
    return '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + inner + "</svg>";
  }
  function iconHome() { return svgWrap('<path d="M3 11l9-7 9 7"/><path d="M5 10v9a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1v-9"/>'); }
  function iconUsers() { return svgWrap('<circle cx="9" cy="8" r="3.2"/><path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6"/><circle cx="17.5" cy="8.5" r="2.6"/><path d="M15.5 14.3c2.7.4 4.5 2.4 4.5 5.7"/>'); }
  function iconGavel() { return svgWrap('<path d="M14 4l6 6M3 21l6-6M8.5 12.5l-5 5 3 3 5-5M9 9l6 6M12 6l6 6"/>'); }
  function iconBank() { return svgWrap('<path d="M3 10l9-6 9 6"/><path d="M4 10h16v2H4z"/><path d="M5 12v7M9 12v7M15 12v7M19 12v7"/><path d="M3 21h18"/>'); }
  function iconCheck() { return svgWrap('<rect x="3.5" y="3.5" width="17" height="17" rx="3"/><path d="M8 12l2.5 2.5L16 9"/>'); }
  function iconCloud() { return svgWrap('<path d="M7 18a4.5 4.5 0 0 1-.4-9 5.5 5.5 0 0 1 10.6-1.6A4 4 0 0 1 17 18H7z"/><path d="M12 12v6M9.5 15.5L12 18l2.5-2.5"/>'); }
  function iconLedger() { return svgWrap('<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/>'); }
  function iconBlog() { return svgWrap('<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/>'); }
  function iconChart() { return svgWrap('<path d="M4 20V10"/><path d="M11 20V4"/><path d="M18 20v-7"/><path d="M3 20h18"/>'); }
  function iconSearch() { return svgWrap('<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>'); }
  function iconBulb() { return svgWrap('<path d="M9 18h6"/><path d="M10 22h4"/><path d="M12 2a6 6 0 0 0-4 10.5c.6.5 1 1.3 1 2.1V16h6v-1.4c0-.8.4-1.6 1-2.1A6 6 0 0 0 12 2Z"/>'); }
  function iconInboxCheck() { return svgWrap('<path d="M3 12h4l2 3h6l2-3h4"/><path d="M5 12 3 5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2l-2 7"/><path d="M3 12v6a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-6"/>'); }
  function iconApprove() { return svgWrap('<rect x="3.5" y="4.5" width="17" height="15" rx="2.5"/><path d="M8 12.5l2.5 2.5L16 9.5"/>'); }
  function iconCalendar() { return svgWrap('<rect x="3.5" y="4.5" width="17" height="16" rx="2.5"/><path d="M3.5 9.5h17"/><path d="M8 2.5v4M16 2.5v4"/>'); }
  function iconReport() { return svgWrap('<path d="M6 2.5h9l4 4v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-17a1 1 0 0 1 1-1Z"/><path d="M9 12h6M9 15.5h6M9 8.5h3"/>'); }
  function iconArchive() { return svgWrap('<rect x="3" y="4" width="18" height="4.5" rx="1"/><path d="M4.5 8.5V19a1 1 0 0 0 1 1h13a1 1 0 0 0 1-1V8.5"/><path d="M10 13h4"/>'); }
  function iconTeam() { return svgWrap('<rect x="3.5" y="8.5" width="17" height="12" rx="1.5"/><path d="M8 8.5V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v3.5"/><path d="M8 13h.01M12 13h.01M16 13h.01M8 17h.01M12 17h.01M16 17h.01"/>'); }

  /* ---------------- Nav ---------------- */
  var navOpen = false;
  function renderNav() {
    var nav = document.getElementById("nav");
    var sidebar = nav.parentNode;
    if (sidebar && sidebar.classList) sidebar.classList.toggle("is-open", navOpen);
    var toggleBtn = document.getElementById("navToggleBtn");
    if (toggleBtn) {
      toggleBtn.setAttribute("aria-expanded", navOpen ? "true" : "false");
      toggleBtn.textContent = navOpen ? "✕ 닫기" : "☰ 메뉴";
      if (!toggleBtn.getAttribute("data-bound")) {
        toggleBtn.setAttribute("data-bound", "1");
        toggleBtn.addEventListener("click", function () { navOpen = !navOpen; renderNav(); });
      }
    }
    var homeQuick = document.getElementById("navHomeQuick");
    if (homeQuick && !homeQuick.getAttribute("data-bound")) {
      homeQuick.setAttribute("data-bound", "1");
      homeQuick.addEventListener("click", function () { currentView = "home"; navOpen = false; pendingImport = null; teamMemberView = null; render(); window.scrollTo(0, 0); });
    }
    // 상단 바는 탭 5개만 둔다. 화면 11개 입구는 '통합 업무본부' 카드 한 군데로 모았다 —
    // 예전엔 상단 메뉴와 업무본부 카드가 같은 곳을 두 번 가리켜서 중복이었다.
    var onHome = currentView === "home";
    var hm = onHome ? homeMode() : null;
    var urgentN = 0;
    try { urgentN = buildUrgentItems(computeHomeStats(), aiWorkLogEvents()).urgentItems.length; } catch (e) { urgentN = 0; }
    var navHtml = "";
    HOME_TABS.forEach(function (t) {
      if (t.key === "office" && isNarrowScreen()) return; // 휴대폰에는 라이브 오피스 탭을 두지 않는다
      navHtml += '<button type="button" class="hq-tab' + (onHome && hm === t.key ? " on" : "") +
        '" data-home-tab="' + t.key + '"><i>' + t.icon + "</i>" + esc(t.label) +
        (t.badge ? '<em class="hq-badge' + (urgentN ? " hot" : "") + '">' + urgentN + "</em>" : "") + "</button>";
    });
    // 홈이 아닐 때는 지금 어느 화면인지 알려 준다. 메뉴가 사라졌으니 이게 유일한 위치 표시다.
    if (!onHome) {
      var cv = VIEWS.find(function (v) { return v.id === currentView; });
      if (cv && cv.id !== "backup") navHtml += '<span class="nav-here">' + esc(cv.short || cv.label) + "</span>";
    }
    navHtml += '<button type="button" class="nav-menu-btn" id="navDrawerBtn" aria-label="전체 업무 열기">☰</button>';
    nav.innerHTML = navHtml;
    var dbtn = document.getElementById("navDrawerBtn");
    if (dbtn) dbtn.addEventListener("click", function () { drawerOpen = true; renderWorkDrawer(); });
    Array.prototype.forEach.call(nav.querySelectorAll("[data-home-tab]"), function (btn) {
      btn.addEventListener("click", function () {
        state.meta[homeModeKey()] = btn.getAttribute("data-home-tab");
        persistLocal();
        currentView = "home";
        pendingImport = null;
        teamMemberView = null;
        navOpen = false;
        render();
        window.scrollTo(0, 0);
      });
    });
    Array.prototype.forEach.call(nav.querySelectorAll("[data-view]"), function (btn) {
      btn.addEventListener("click", function () {
        currentView = btn.getAttribute("data-view");
        pendingImport = null;
        teamMemberView = null;
        navOpen = false;
        render();
        window.scrollTo(0, 0);
      });
    });
    var foot = document.getElementById("sidebarFoot");
    var lu = state.meta.lastUpdated;
    foot.innerHTML = esc(lu ? "마지막 저장: " + new Date(lu).toLocaleString("ko-KR") : "저장된 데이터 없음") +
      "<br>" + esc(cloudSyncStatusLabel());
  }

  /* ---------------- Home ---------------- */
  function homeAvailableMonths() {
    var keys = {};
    Object.keys(monthlyBankStats()).forEach(function (mk) { keys[mk] = true; });
    state.students.forEach(function (s) {
      if (s.appliedDate) keys[s.appliedDate.slice(0, 7)] = true;
      (s.installments || []).forEach(function (i) { if (i.month) keys[i.month] = true; });
    });
    state.auctions.forEach(function (a) { keys[(a.createdAt || a.updatedAt || "").slice(0, 7)] = true; });
    state.loans.forEach(function (l) { keys[(l.createdAt || l.updatedAt || "").slice(0, 7)] = true; });
    delete keys[""];
    keys[monthKey()] = true;
    return Object.keys(keys).sort().reverse();
  }

  function computeMonthlyKpis(mk) {
    var newStudentsCount = newStudentBreakdownFor(mk).filter(function (it) { return it.checked; }).length;
    var revenue = monthlyRevenueFor(mk);
    var unpaidCount = 0, unpaidTotal = 0;
    state.students.forEach(function (s) {
      if (s.paymentType === "월별") {
        (s.installments || []).forEach(function (i) {
          if (!i.paid && i.month === mk) { unpaidCount++; unpaidTotal += Number(i.amount) || 0; }
        });
      } else if (s.appliedDate && s.appliedDate.slice(0, 7) === mk && !s.paid) {
        unpaidCount++; unpaidTotal += Number(s.tuition) || 0;
      }
    });
    var activeAuctions = state.auctions.filter(function (a) {
      return AUCTION_ACTIVE_STAGES.indexOf(a.stage) !== -1 && (a.createdAt || a.updatedAt || "").slice(0, 7) === mk;
    });
    var activeLoans = state.loans.filter(function (l) {
      return l.stage !== "대출완료" && (l.createdAt || l.updatedAt || "").slice(0, 7) === mk;
    });
    var bankMonth = monthlyBankStats()[mk] || { deposit: 0, withdrawal: 0, count: 0, tuition: 0, consulting: 0, capital: 0, general: 0, adSpend: 0, reimburse: 0, advance: 0 };

    return {
      month: mk, newStudents: newStudentsCount, revenue: revenue,
      unpaidCount: unpaidCount, unpaidTotal: unpaidTotal,
      activeAuctions: activeAuctions.length, activeLoans: activeLoans.length,
      bankMonth: bankMonth
    };
  }

  function computeHomeStats() {
    var mk = monthKey();
    var today = todayStr();
    var wk = weekRange();

    var unpaid = state.students.filter(studentHasUnpaid);

    var todayTasks = state.tasks.filter(function (t) { return t.date === today; });
    var todayDone = todayTasks.filter(function (t) { return t.done; }).length;

    var weekTasks = state.tasks.filter(function (t) { return t.date >= wk.start && t.date <= wk.end; });
    var weekDone = weekTasks.filter(function (t) { return t.done; }).length;

    var overdueTasks = state.tasks.filter(function (t) { return !t.done && t.date < today; });
    var staleUnpaid = unpaid.filter(function (s) {
      if (s.paymentType === "월별") {
        return (s.installments || []).some(function (i) { return !i.paid && i.month && i.month < mk; });
      }
      return s.appliedDate && daysBetween(s.appliedDate, today) > 7;
    });
    var stuckLoans = state.loans.filter(function (l) {
      return l.stage !== "대출완료" && l.updatedAt && daysBetween(l.updatedAt.slice(0, 10), today) > 7;
    });
    var pendingDeposits = state.transactions.filter(function (t) {
      return t.deposit > 0 && !t.category && daysBetween(t.date, today) > 3;
    });
    var blog = blogStats();

    return {
      todayTasks: todayTasks, todayDone: todayDone,
      weekTasks: weekTasks, weekDone: weekDone,
      overdueTasks: overdueTasks, staleUnpaid: staleUnpaid, stuckLoans: stuckLoans, pendingDeposits: pendingDeposits,
      blogToday: blog.todayCount, blogWeek: blog.weekCount, blogMonth: blog.monthCount
    };
  }

  function stageDistributionHtml(items, stages, key) {
    var counts = {};
    stages.forEach(function (s) { counts[s] = 0; });
    items.forEach(function (it) { if (counts[it[key]] !== undefined) counts[it[key]]++; });
    var max = Math.max.apply(null, stages.map(function (s) { return counts[s]; }).concat([1]));
    if (items.length === 0) return '<div class="empty-state">등록된 데이터가 없습니다.</div>';
    return stages.map(function (s) {
      var n = counts[s];
      var pct = Math.round((n / max) * 100);
      return '<div class="stage-row"><div class="name">' + esc(s) + '</div><div class="bar-track"><div class="bar-fill" style="width:' + pct + '%"></div></div><div class="n">' + n + "</div></div>";
    }).join("");
  }

  function syncEventsBannerHtml() {
    var events = state.meta.syncEvents || [];
    var seenAt = state.meta.syncEventsSeenAt || null;
    var unseen = events.filter(function (e) { return !seenAt || e.at > seenAt; });
    if (!unseen.length) return "";
    var shown = unseen.slice(0, 8);
    var rows = shown.map(function (e) {
      return '<div class="list-row"><span class="txt">' + esc(e.message) + '</span><span class="meta">' + new Date(e.at).toLocaleString("ko-KR") + "</span></div>";
    }).join("");
    var more = unseen.length > shown.length ? '<div class="empty-state" style="padding:8px 4px">외 ' + (unseen.length - shown.length) + "건 더" : "";
    return '<div class="card section-gap" style="border-color:var(--brand);background:var(--brand-soft)">' +
      '<h3>☁ 대시보드를 여는 동안 자동으로 반영된 변경사항 <span class="count">' + unseen.length + "건</span></h3>" +
      rows + more +
      '<div style="margin-top:12px"><button class="btn btn-sm" data-sync-banner-dismiss>확인했어요</button></div>' +
      "</div>";
  }

  // "홈 화면에서 한눈에" — 이번달 문의·등록, 현재 진행중 인원, 월별 입출금, 자동화 실행 현황을
  // 대시보드를 다른 화면으로 옮겨다니지 않아도 바로 볼 수 있게 모아둔다.
  function homeOverviewHtml() {
    var mk = monthKey();
    var html = "";

    var monthDbEntries = state.studentDb.filter(function (s) { return (s.registeredDate || "").slice(0, 7) === mk; });
    var paidCount = monthDbEntries.filter(function (s) { return !!s.paymentStatus; }).length;
    var inquiryCount = monthDbEntries.length - paidCount;
    html += '<div class="card section-gap"><h3>' + esc(monthLabel(mk)) + ' 수강 문의·등록 현황<span class="count">' + monthDbEntries.length + "명</span></h3>";
    if (monthDbEntries.length === 0) {
      html += '<div class="empty-state">이번달 등록된 문의·등록 건이 없습니다.</div>';
    } else {
      html += '<div class="list-row"><span class="txt">결제 확인</span><span class="meta">' + paidCount + "명</span></div>";
      html += '<div class="list-row"><span class="txt">문의 단계(결제 전)</span><span class="meta">' + inquiryCount + "명</span></div>";
    }
    html += '<div style="margin-top:12px"><button class="btn btn-ghost btn-sm" data-goto="studentDb">수강생 DB로 이동 →</button></div>';
    html += "</div>";

    // "등록완료"만으로는 부족하다 — 실제 입금(매출)이 확인된 사람만 지금 수업중인 것으로 본다는
    // 대리님 피드백에 따라, isRevenueConfirmedWithAmount(입금액 0원 제외)를 함께 확인한다.
    var activeStudents = state.students.filter(function (s) { return isRevenueConfirmedWithAmount(s) && studentCourseStatus(s) === "진행중"; });
    var byLevel = {};
    activeStudents.forEach(function (s) { byLevel[s.level] = (byLevel[s.level] || 0) + 1; });
    html += '<div class="card section-gap"><h3>현재 수업중인 인원<span class="count">' + activeStudents.length + "명</span></h3>";
    if (activeStudents.length === 0) {
      html += '<div class="empty-state">현재 진행중인 수강생이 없습니다.</div>';
    } else {
      html += '<div class="sub" style="margin-bottom:8px">' + STUDENT_LEVELS.filter(function (l) { return byLevel[l]; }).map(function (l) { return esc(l) + " " + byLevel[l] + "명"; }).join(" · ") + "</div>";
      html += '<div style="display:flex;flex-wrap:wrap;gap:6px">';
      activeStudents.slice().sort(function (a, b) { return (a.name || "").localeCompare((b.name || ""), "ko"); }).slice(0, 30).forEach(function (s) {
        html += pill(s.name, "brand");
      });
      if (activeStudents.length > 30) html += '<span class="meta" style="align-self:center">+' + (activeStudents.length - 30) + "명 더</span>";
      html += "</div>";
    }
    html += '<div style="margin-top:12px"><button class="btn btn-ghost btn-sm" data-goto="students">수강생 · 매출로 이동 →</button></div>';
    html += "</div>";

    var bankStats = monthlyBankStats();
    var bankMonthKeys = Object.keys(bankStats).sort().reverse().slice(0, 4);
    html += '<div class="card section-gap"><h3>월별 입출금 내역</h3>';
    if (!bankMonthKeys.length) {
      html += '<div class="empty-state">등록된 은행 거래내역이 없습니다.</div>';
    } else {
      html += '<div class="month-scroller" style="margin-bottom:0">';
      bankMonthKeys.forEach(function (bmk) {
        var st = bankStats[bmk];
        var net = st.deposit - st.withdrawal; // 대납 정산 차액(회사 몫·초과분)은 그대로 순이익에 반영된다
        html += '<div class="month-card" style="cursor:default">';
        html += '<div class="m">' + esc(monthLabel(bmk)) + "</div>";
        html += '<div class="row"><span class="l">입금</span><span class="v in">' + won(st.deposit) + "</span></div>";
        html += '<div class="row"><span class="l">출금</span><span class="v out">' + won(st.withdrawal) + "</span></div>";
        html += '<div class="row"><span class="l">순이익</span><span>' + won(net) + "</span></div>";
        if ((st.reimburse || 0) > 0 || (st.advance || 0) > 0) html += '<div class="row"><span class="l">회식 회사몫</span><span class="meta">' + won(Math.max((st.advance || 0) - (st.reimburse || 0), 0)) + "</span></div>";
        html += "</div>";
      });
      html += "</div>";
    }
    html += '<div style="margin-top:12px"><button class="btn btn-ghost btn-sm" data-goto="bank">은행 거래내역으로 이동 →</button></div>';
    html += "</div>";

    return html;
  }

  function hubCardHtml(icon, title, rows, actions) {
    var html = '<div class="hub-card"><div class="hub-head"><span class="hub-icon">' + icon + '</span><span class="hub-title">' + esc(title) + "</span></div>";
    rows.forEach(function (r) {
      html += '<div class="hub-row"><span class="hub-label">' + esc(r.label) + '</span><span class="hub-value' + (r.tone ? " tone-" + r.tone : "") + '">' + r.value + "</span></div>";
    });
    html += '<div class="hub-actions">' + actions.join("") + "</div></div>";
    return html;
  }

  function gotoBtn(view, label, member) {
    return '<button class="btn btn-ghost btn-sm" data-goto="' + view + '"' + (member ? ' data-goto-member="' + member + '"' : "") + ">" + esc(label) + " →</button>";
  }

  // 홈을 "영역별 허브"로 — 5개 업무 영역(학원·수강생 / 매출·회계 / 경매·컨설팅 / 블로그·마케팅 / 시스템)마다
  // 지금 당장 알아야 할 숫자 2~4개와 바로가기만 보여주고, 세부 목록은 아래 접힘 영역으로 내린다.
  function homeHubHtml(s, endingSoon) {
    var mk = monthKey();
    var kpi = computeMonthlyKpis(mk);

    var monthDbEntries = state.studentDb.filter(function (x) { return (x.registeredDate || "").slice(0, 7) === mk; });
    var paidCount = monthDbEntries.filter(function (x) { return !!x.paymentStatus; }).length;
    var activeStudents = state.students.filter(function (x) { return isRevenueConfirmedWithAmount(x) && studentCourseStatus(x) === "진행중"; });

    var pendingBlog = state.blogPosts.filter(function (p) { return p.status === "발행대기"; }).length;
    var heldBlog = state.blogPosts.filter(function (p) { return p.status === "보류"; }).length;
    var lastRun = (state.blogAutomationLog || []).slice().sort(function (a, b) { return a.runAt < b.runAt ? 1 : -1; })[0];
    var unseenSync = (state.meta.syncEvents || []).filter(function (e) { return !state.meta.syncEventsSeenAt || e.at > state.meta.syncEventsSeenAt; }).length;

    var html = '<div class="hub-grid">';

    html += hubCardHtml("🏫", "학원 · 수강생", [
      { label: monthLabel(mk) + " 문의·등록", value: monthDbEntries.length + "명 <span class=\"meta\">(결제 " + paidCount + " · 문의 " + (monthDbEntries.length - paidCount) + ")</span>" },
      { label: "현재 수업중(매출 확정)", value: activeStudents.length + "명", tone: "good" },
      { label: "7일 내 종료·갱신 확인", value: endingSoon.length + "건", tone: endingSoon.length ? "warn" : "" },
      { label: "이름 미상 문의", value: namelessDbEntries().length + "명" + (namelessDbEntries().length ? ' <span class="meta">(수강생 DB에서 이름 입력)</span>' : ""), tone: namelessDbEntries().length ? "warn" : "" }
    ], ['<button class="btn btn-primary btn-sm" data-goto="studentDb" data-open-wizard>+ 신규 수강생 등록</button>', gotoBtn("studentDb", "수강생 DB"), gotoBtn("students", "수강생 · 매출")]);

    html += hubCardHtml("💰", "매출 · 회계", [
      { label: monthLabel(mk) + " 확정 매출", value: won(kpi.revenue), tone: "good" },
      { label: "미수금", value: won(kpi.unpaidTotal) + " <span class=\"meta\">(" + kpi.unpaidCount + "건)</span>", tone: kpi.unpaidCount ? "warn" : "" },
      { label: monthLabel(mk) + " 입금 / 출금", value: won(kpi.bankMonth.deposit) + " / " + won(kpi.bankMonth.withdrawal) },
      { label: monthLabel(mk) + " 광고비", value: won(kpi.bankMonth.adSpend) }
    ], [gotoBtn("bank", "은행 거래내역"), gotoBtn("students", "매출 실적")]);

    html += hubCardHtml("🏛", "경매 · 컨설팅", [
      { label: "진행중 경매·컨설팅", value: kpi.activeAuctions + "건" },
      { label: "진행중 대출상담", value: kpi.activeLoans + "건" + (s.stuckLoans.length ? ' <span class="meta">(정체 ' + s.stuckLoans.length + "건)</span>" : ""), tone: s.stuckLoans.length ? "warn" : "" },
      { label: "데일리 경매분석 등록", value: state.marketAuctions.length + "건" }
    ], [gotoBtn("auctions", "경매·컨설팅"), gotoBtn("marketAuction", "데일리 경매분석"),
        '<a class="btn btn-ghost btn-sm" href="' + esc(EXTERNAL_TOOL_URL) + '" target="_blank" rel="noopener">전국 경매 물건 현황판 ↗</a>']);

    // 주택관리는 별도 아티팩트라 여기서 셀 숫자가 없다. 없는 숫자를 지어내지 않고 가는 길만 둔다.
    html += hubCardHtml("🏠", "주택관리", [
      { label: "관리 현황", value: '<span class="meta">별도 업무판에서 관리</span>' }
    ], ['<a class="btn btn-primary btn-sm" href="' + esc(HOUSING_TOOL_URL) + '" target="_blank" rel="noopener">옆커폰 주택관리 현황 ↗</a>']);

    html += hubCardHtml("✍️", "블로그 · 마케팅", [
      { label: "오늘 발행", value: s.blogToday + " / " + BLOG_DAILY_GOAL + "건", tone: s.blogToday >= BLOG_DAILY_GOAL ? "good" : "warn" },
      { label: "발행대기 · 보류", value: pendingBlog + "건 · " + heldBlog + "건", tone: heldBlog ? "warn" : "" },
      { label: "AI팀 마지막 실행", value: lastRun ? esc(new Date(lastRun.runAt).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })) : "기록 없음" }
    ], [gotoBtn("team", "효제이 AI직원팀"), gotoBtn("team", "블로그 업무", "blog")]);

    html += hubCardHtml("⚙️", "시스템 · 동기화", [
      { label: "마지막 저장", value: state.meta.lastUpdated ? esc(new Date(state.meta.lastUpdated).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })) : "-" },
      { label: "클라우드 동기화", value: (!window.claude || !window.claude.mcp) ? "이 화면에서는 사용 불가"
          : cloudSyncState === "syncing" ? "동기화 중…"
          : cloudSyncState === "error" ? '<span class="tone-warn">오류 · 자동 재시도</span>'
          : state.meta.lastCloudSync ? esc(new Date(state.meta.lastCloudSync).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })) : "아직 안 됨" },
      { label: "자동 반영 알림", value: unseenSync + "건", tone: unseenSync ? "warn" : "" }
    ], [gotoBtn("backup", "백업 · 공유"), gotoBtn("tasks", "업무 체크리스트")]);

    html += "</div>";
    return html;
  }

  function homeActionStripHtml(urgentItems, endedUnpaid) {
    var html = '<div class="card home-action-card section-gap"><h3>🚨 지금 처리할 일<span class="count">' + urgentItems.length + "건</span></h3>";
    if (!urgentItems.length) {
      html += '<div class="list-row"><span class="txt">' + pill("지금 처리할 항목이 없어요", "good") + "</span></div>";
    } else {
      urgentItems.slice(0, 5).forEach(function (u) {
        var go = u.go && u.go !== "home" ? u.go : null;
        html += (go ? '<button type="button" class="list-row is-link" data-goto="' + go + '">' : '<div class="list-row">') +
          '<span class="dot" style="background:var(--' + u.dot + ')"></span>' +
          '<span class="txt">' + esc(u.txt) + "</span>" +
          '<span class="meta">' + esc(u.meta) + "</span>" +
          (go ? '<span class="go-arrow">›</span></button>' : "</div>");
      });
      if (urgentItems.length > 5) html += '<div class="empty-state" style="padding:6px 4px">외 ' + (urgentItems.length - 5) + "건 · 아래 상세 현황에서 전체 확인</div>";
    }
    if (endedUnpaid.length) {
      var endedUnpaidTotal = endedUnpaid.reduce(function (sum, st) { return sum + studentUnpaidTotal(st); }, 0);
      html += '<button type="button" class="list-row is-link" data-goto="students"><span class="dot" style="background:var(--neutral-ink)"></span><span class="txt">과정 종료 후 미수금 (긴급 아님)</span><span class="meta">' + endedUnpaid.length + "건 · " + won(endedUnpaidTotal) + '</span><span class="go-arrow">›</span></button>';
    }
    html += "</div>";
    return html;
  }


  // ───────── 주간 KPI 입력표 (팀 KPI 양식과 같은 6개 항목 · 같은 계산 기준) ─────────
  // 팀 KPI 양식의 "8월 기준" 값과 대조해 확정한 기준:
  //  매출 = 은행 입금 합계 / 순이익 = 입금 − 출금 / 문의 = 수강생 DB 등록 수 /
  //  유료 등록 = 수강료(tuition) 입금 건수 / 체험단 = DB 체험단 등록 수 / 블로그 = 파이프라인이 만든 글 수
  var WEEKLY_KPI_DEFAULT_TARGETS = { blog: [7, 35], revenue: [740000, 3700000], profit: [200000, 1000000], inquiry: [6, 30], paid: [2, 10], trial: [1, 4], analysis: [0, 0] };
  var kpiWeekOffset = 0;
  function weeklyKpiTargets() {
    var saved = state.meta.weeklyKpiTargets || {};
    var out = {};
    Object.keys(WEEKLY_KPI_DEFAULT_TARGETS).forEach(function (k) {
      var d = WEEKLY_KPI_DEFAULT_TARGETS[k], v = saved[k] || [];
      out[k] = [v[0] != null ? Number(v[0]) : d[0], v[1] != null ? Number(v[1]) : d[1]];
    });
    return out;
  }
  function weekRangeOffset(offset) {
    var base = weekRange();
    return { start: addDaysToDateStr(base.start, offset * 7), end: addDaysToDateStr(base.end, offset * 7) };
  }
  function inRange(d, a, b) { return !!d && d >= a && d <= b; }
  function computeKpiValues(from, to) {
    var dep = 0, wd = 0, tuitionCount = 0, consulting = 0, advance = 0, reimburse = 0;
    state.transactions.forEach(function (t) {
      if (!inRange(t.date, from, to)) return;
      if (isReimburseDeposit(t)) reimburse += Number(t.deposit) || 0;
      else dep += Number(t.deposit) || 0;
      if (isAdvanceSpend(t)) advance += Number(t.withdrawal) || 0;
      else wd += Number(t.withdrawal) || 0;
      if (t.category === "tuition" && t.deposit > 0) tuitionCount++;
      if (t.category === "consulting" && t.deposit > 0) consulting += Number(t.deposit) || 0;
    });
    var dbEntries = state.studentDb.filter(function (d) { return inRange(d.registeredDate, from, to); });
    var trial = dbEntries.filter(function (d) { return !!(d.courses && d.courses.trial) || /체험단/.test(d.memo || ""); }).length;
    // KPI "블로그 콘텐츠 발행" = 그 기간에 실제로 네이버에 올라간 글(발행완료, 게시일 기준).
    // 예전엔 파이프라인이 만든 글 수(모든 상태)를 셌는데, 대리님이 "발행완료된 건 다 KPI로 잡아야 한다"고
    // 정했다(2026-09-16). RSS 로 등록된 글은 createdAt 이 등록 시각이라 게시일(publishedAt)을 먼저 본다.
    var posts = state.blogPosts.filter(function (p) { return inRange((p.createdAt || p.date || "").slice(0, 10), from, to); });
    var publishedPosts = state.blogPosts.filter(function (p) {
      return p.status === "발행완료" && inRange((p.publishedAt || p.date || (p.createdAt || "").slice(0, 10) || "").slice(0, 10), from, to);
    });
    return {
      blog: { value: publishedPosts.length, meta: "게시일 기준 발행완료 · 파이프라인 생성 " + posts.length + "건 · 대기 " + posts.filter(function (p) { return p.status === "발행대기"; }).length + "건" },
      revenue: { value: dep, meta: "수강료 " + tuitionCount + "건" + (consulting ? " · 컨설팅 " + won(consulting) : "") },
      // 대납 정산은 매출에서 빼되 순이익에는 차액만 넣는다. 회식엔 대리님·대표님 몫이 늘 섞여 있어
      // 회수액이 결제액보다 작은 게 정상이고(2026-09-16 대리님), 그 차액이 곧 회사 식대(복리후생비)다.
      // 반대로 더 걷혔으면 잡이익. 결국 순이익 = 통장 입금 − 통장 출금 그대로다.
      profit: { value: dep - wd + (reimburse - advance), meta: "입금 " + won(dep) + " − 출금 " + won(wd) +
        (advance > reimburse ? " − 회식 회사몫 " + won(advance - reimburse) : (reimburse > advance ? " + 정산 초과 " + won(reimburse - advance) : "")) },
      inquiry: { value: dbEntries.length, meta: dbEntries.length ? dbEntries.slice(0, 4).map(dbDisplayName).join(", ") + (dbEntries.length > 4 ? " 외" : "") : "DB 신규 등록 없음" },
      paid: { value: tuitionCount, meta: "수강료 입금 건수" },
      trial: { value: trial, meta: "DB 체험단 등록" },
      analysis: analysisPostsKpi(from, to)
    };
  }
  // "경매 권리분석 완료" = 블로그에 실제로 올라간 권리분석 글(사건번호가 있는 발행완료 글) 수, 게시일 기준.
  // 2026-09-17 대리님 지시("내가 발행한 거면 다 잡아줘") — 데일리 경매분석 카드가 없는 사건도 글이 올라갔으면 센다.
  // 예전엔 대리님이 채팅으로 알려준 날짜별 건수(meta.kpiLog)를 썼는데, 이제 그 기록은 참고로만 보여 준다.
  var CASE_NO_RE = /20\d\d타경\d+/;
  function isAnalysisPost(p) {
    return p && p.status === "발행완료" && CASE_NO_RE.test((p.caseNumber || "") + " " + (p.title || ""));
  }
  function analysisPostsKpi(from, to) {
    var posts = state.blogPosts.filter(function (p) {
      return isAnalysisPost(p) && inRange((p.publishedAt || p.date || (p.createdAt || "").slice(0, 10) || "").slice(0, 10), from, to);
    });
    var manual = kpiLogSum("analysis", from, to);
    var meta = "블로그 게시 권리분석 글 " + posts.length + "건 (게시일 기준)";
    if (manual.value && manual.value !== posts.length) meta += " · 수동 기록 " + manual.value + "건은 참고";
    return { value: posts.length, meta: meta };
  }
  function kpiLogSum(key, from, to) {
    var log = (state.meta.kpiLog && state.meta.kpiLog[key]) || {};
    var days = Object.keys(log).filter(function (d) { return inRange(d, from, to) && log[d] > 0; }).sort();
    var total = days.reduce(function (sum, d) { return sum + (Number(log[d]) || 0); }, 0);
    var meta = days.length ? days.map(function (d) { return formatShortDate(d).replace(/\(.\)$/, "") + " " + log[d] + "건"; }).join(" · ") : "기록 없음 — 아래 칸에 날짜·건수를 적거나 채팅으로 알려주세요";
    return { value: total, meta: meta };
  }
  var WEEKLY_KPI_ROWS = [
    { key: "blog", label: "에듀 블로그 콘텐츠 발행", unit: "건" },
    { key: "revenue", label: "에듀 수강생 매출", unit: "원" },
    { key: "profit", label: "에듀 순이익", unit: "원" },
    { key: "inquiry", label: "에듀 신규 수강생 문의", unit: "명" },
    { key: "paid", label: "에듀 유료 수강생 등록", unit: "명" },
    { key: "trial", label: "에듀 체험단 운영", unit: "명" },
    { key: "analysis", label: "경매 권리분석 완료", unit: "건" }
  ];
  function kpiFmt(v, unit) { return unit === "원" ? won(v) : v + unit; }
  function weeklyKpiHtml() {
    var wk = weekRangeOffset(kpiWeekOffset);
    // 월 누적은 주가 끝나는 날이 속한 달 기준(8/31~9/6 주는 9월 누적). 오늘 이후는 세지 않는다.
    var mk = wk.end.slice(0, 7);
    var monthFrom = mk + "-01";
    var monthTo = wk.end > todayStr() ? todayStr() : wk.end;
    var straddles = wk.start.slice(0, 7) !== mk;
    var week = computeKpiValues(wk.start, wk.end);
    var month = computeKpiValues(monthFrom, monthTo);
    var targets = weeklyKpiTargets();
    var sd = parseYMD(wk.start), ed = parseYMD(wk.end);
    var weekLabel = (sd.getMonth() + 1) + "/" + sd.getDate() + " ~ " + (ed.getMonth() + 1) + "/" + ed.getDate();
    var tag = kpiWeekOffset === 0 ? "이번 주" : kpiWeekOffset === -1 ? "지난 주" : (kpiWeekOffset < 0 ? (-kpiWeekOffset) + "주 전" : kpiWeekOffset + "주 후");
    var html = '<div class="card section-gap weekly-kpi-card"><h3>📋 주간 KPI <span class="count">' + esc(tag) + " · " + esc(weekLabel) + " (월~일)</span></h3>";
    html += '<div class="weekly-kpi-bar"><div class="wk-nav">';
    html += '<button type="button" id="kpiWeekPrev" aria-label="이전 주">◀</button>';
    html += '<button type="button" id="kpiWeekToday"' + (kpiWeekOffset === 0 ? " disabled" : "") + ">이번 주</button>";
    html += '<button type="button" id="kpiWeekNext"' + (kpiWeekOffset >= 0 ? " disabled" : "") + ' aria-label="다음 주">▶</button>';
    html += "</div>";
    html += '<button type="button" class="btn btn-primary btn-sm" id="kpiWeekCopy">📋 실적값 복사</button>';
    html += "</div>";
    html += '<div class="table-wrap"><table class="data-table mobile-fit weekly-kpi-table"><thead><tr>';
    html += "<th>KPI</th><th class=\"num\">주간 실적</th><th class=\"num\">목표</th><th class=\"num\">달성률</th><th class=\"num col-mobile-hide\">" + esc(monthLabelShort(mk)) + " 누적</th><th class=\"num col-mobile-hide\">월 목표</th>";
    html += "</tr></thead><tbody>";
    var copyLines = [];
    WEEKLY_KPI_ROWS.forEach(function (r) {
      var w = week[r.key], m = month[r.key], tg = targets[r.key];
      var rate = tg[0] > 0 ? Math.round((w.value / tg[0]) * 100) : null;
      var rateCls = rate == null ? "" : rate >= 100 ? "tone-good" : rate >= 50 ? "tone-warn" : "tone-danger";
      var mRate = tg[1] > 0 ? Math.round((m.value / tg[1]) * 100) : null;
      html += '<tr><td class="wk-name"><b>' + esc(r.label.replace(/^에듀 /, "")) + "</b>" + (w.meta ? '<span class="meta">' + esc(w.meta) + "</span>" : "") + "</td>";
      html += '<td class="num"><b class="wk-val">' + kpiFmt(w.value, r.unit) + "</b></td>";
      html += '<td class="num"><input type="number" class="weekly-kpi-target" data-kpi-target="' + r.key + '" data-kpi-idx="0" value="' + tg[0] + '" min="0"></td>';
      html += '<td class="num"><span class="weekly-kpi-rate ' + rateCls + '">' + (rate == null ? "-" : rate + "%") + "</span>" +
        '<span class="wk-bar"><i class="' + rateCls + '" style="width:' + (rate == null ? 0 : Math.min(100, rate)) + '%"></i></span></td>';
      html += '<td class="num col-mobile-hide">' + kpiFmt(m.value, r.unit) + (mRate == null ? "" : ' <span class="meta">(' + mRate + "%)</span>") + "</td>";
      html += '<td class="num col-mobile-hide"><input type="number" class="weekly-kpi-target" data-kpi-target="' + r.key + '" data-kpi-idx="1" value="' + tg[1] + '" min="0"></td></tr>';
      copyLines.push(r.label + "\t" + w.value + "\t" + m.value);
    });
    html += "</tbody></table></div>";
    html += '<div class="weekly-kpi-log"><span class="weekly-kpi-log-label">✍ 권리분석 보조 기록 <span class="meta">(KPI 는 블로그 게시 글로 자동 집계 · 여기는 참고용)</span></span>' +
      '<input type="date" id="kpiLogDate" class="inline-select" value="' + esc(todayStr()) + '">' +
      '<input type="number" id="kpiLogCount" class="weekly-kpi-target" min="0" step="1" placeholder="건수">' +
      '<button type="button" class="btn btn-ghost btn-sm" id="kpiLogSaveBtn">기록</button>' +
      '<span class="meta">같은 날짜를 다시 적으면 덮어씀 · 0이면 삭제</span></div>';
    if (straddles) html += '<div class="weekly-kpi-note" style="color:var(--warn)">※ 이 주는 두 달에 걸쳐 있습니다 (' + esc(formatShortDate(wk.start) + (wk.start === addDaysToDateStr(monthFrom, -1) ? "" : "~" + formatShortDate(addDaysToDateStr(monthFrom, -1)))) + ' 실적 포함). 팀 KPI 양식이 1일 기준이면 그 며칠은 빼고 적어주세요.</div>';
    html += '<details class="weekly-kpi-help"><summary>계산 기준 보기</summary><ul>' +
      "<li><b>매출</b> 은행 입금 합계 · <b>순이익</b> 입금 − 출금</li>" +
      "<li><b>문의</b> 수강생 DB 신규 등록 수 · <b>유료 등록</b> 수강료 입금 건수</li>" +
      "<li><b>체험단</b> DB 체험단 등록 수 · <b>블로그</b> 실제 네이버에 올라간 글 수(발행완료, 게시일 기준)</li>" +
      "<li><b>권리분석</b> 블로그에 올라간 권리분석 글(사건번호 있는 발행완료 글) 수 — 데일리 경매분석에 없는 사건도 글이 올라갔으면 셉니다</li>" +
      "<li>목표 칸은 직접 고칠 수 있고 자동 저장됩니다. 은행 거래내역이 들어온 날짜까지만 반영됩니다.</li>" +
      "</ul></details>";
    html += '<textarea id="kpiWeekCopyText" hidden>' + esc(copyLines.join("\n")) + "</textarea>";
    html += "</div>";
    return html;
  }
  function bindWeeklyKpi() {
    var prev = document.getElementById("kpiWeekPrev"), next = document.getElementById("kpiWeekNext"), cur = document.getElementById("kpiWeekToday"), copy = document.getElementById("kpiWeekCopy");
    if (prev) prev.addEventListener("click", function () { kpiWeekOffset--; render(); });
    if (next) next.addEventListener("click", function () { if (kpiWeekOffset < 0) { kpiWeekOffset++; render(); } });
    if (cur) cur.addEventListener("click", function () { kpiWeekOffset = 0; render(); });
    if (copy) copy.addEventListener("click", function () {
      var ta = document.getElementById("kpiWeekCopyText");
      var text = ta ? ta.value : "";
      var done = function (ok) { toast(ok ? "KPI 실적값을 복사했습니다 (항목 · 주간 · 월누적)" : "복사에 실패했습니다. 표의 숫자를 직접 입력해주세요."); };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(function () { done(true); }, function () { done(false); });
      else done(false);
    });
    var logBtn = document.getElementById("kpiLogSaveBtn");
    if (logBtn) logBtn.addEventListener("click", function () {
      var d = (document.getElementById("kpiLogDate") || {}).value;
      var raw = (document.getElementById("kpiLogCount") || {}).value;
      if (!d) { toast("날짜를 선택해주세요."); return; }
      if (raw === "" || raw == null) { toast("건수를 입력해주세요."); return; }
      var n = Math.max(0, Number(raw) || 0);
      var log = kpiLogFor("analysis");
      if (n === 0) delete log[d]; else log[d] = n;
      saveState();
      toast(formatShortDate(d) + " 권리분석 " + n + "건으로 기록했습니다.");
      render();
    });
    Array.prototype.forEach.call(document.querySelectorAll("[data-kpi-target]"), function (el) {
      el.addEventListener("change", function () {
        var key = el.getAttribute("data-kpi-target"), idx = Number(el.getAttribute("data-kpi-idx"));
        var t = weeklyKpiTargets();
        t[key][idx] = Math.max(0, Number(el.value) || 0);
        state.meta.weeklyKpiTargets = t;
        saveState();
        render();
      });
    });
  }

  // 긴급 목록 만들기. 홈 본문과 상단 탭바 배지가 같은 값을 써야 해서 함수로 뺐다.
  // (예전엔 renderHome 안에만 있어서 탭바에서 다시 세면 기준이 갈릴 위험이 있었다.)
  function buildUrgentItems(s, routineEvents) {
    var endedUnpaid = [];
      var urgentItems = [];
      s.overdueTasks.forEach(function (t) {
        urgentItems.push({ go: "home", dot: "danger", txt: "[지연] " + t.title, meta: formatShortDate(t.date) + " 예정 · " + CATEGORY_META[t.category].label });
      });
      // 5주 과정(초급반·중급반)이 이미 끝난 학생의 미납은 "긴급"이 아니라 "미수금 관리" 성격이라
      // 진행중인 학생의 긴급 건과 섞이면 헷갈린다는 피드백에 따라 분리한다.
      s.staleUnpaid.forEach(function (st) {
        // 2026-08-05 대량 이전 당시 appliedDate가 그날로 일괄 찍힌 118명은 실제로는 예전부터
        // 다니던 기존 수강생이고 tuition도 0원(실제 금액 미기록)이라, 진짜 미수금이 아니다.
        // "신규 수강생" 집계에서 이미 제외하는 것과 같은 기준으로 긴급 처리 목록에서도 제외한다.
        if (AUG5_BULK_IMPORT_STUDENT_IDS.indexOf(st.id) !== -1) return;
        var ended = studentCourseStatus(st) === "종료";
        if (st.paymentType === "월별") {
          var overdueInst = (st.installments || []).filter(function (i) { return !i.paid && i.month && i.month < monthKey(); });
          if (ended) { endedUnpaid.push(st); return; }
          urgentItems.push({ go: "students", dot: "warn", txt: st.name + " 회차 결제 밀림", meta: overdueInst.length + "개월 미납 · " + won(studentUnpaidTotal(st)) });
        } else {
          if (ended) { endedUnpaid.push(st); return; }
          urgentItems.push({ go: "students", dot: "warn", txt: st.name + " 수강료 미입금", meta: "신청 " + formatShortDate(st.appliedDate) + " · " + won(st.tuition) });
        }
      });
      s.stuckLoans.forEach(function (l) {
        urgentItems.push({ go: "auctions", dot: "warn", txt: l.client + " 대출상담 정체", meta: l.stage + " 단계 · 최근 업데이트 7일 이상 경과" });
      });
      s.pendingDeposits.forEach(function (t) {
        urgentItems.push({ go: "bank", dot: "warn", txt: "미확정 입금: " + (t.description || "적요 없음"), meta: formatShortDate(t.date) + " · " + won(t.deposit) + " · 수강료 확인 필요" });
      });
      if (s.blogToday < BLOG_DAILY_GOAL) {
        urgentItems.push({ go: "team", dot: "warn", txt: "오늘 블로그 발행 목표 미달성", meta: s.blogToday + "/" + BLOG_DAILY_GOAL + "건 발행 · 효제이 AI직원팀 탭에서 등록" });
      }
      var lateRoutines = ROUTINE_JOBS.map(function (j) { return { job: j, st: routineStatus(j, routineEvents) }; })
        .filter(function (x) { return x.st.kind === "late" || x.st.kind === "fail"; });
      if (lateRoutines.length) {
        urgentItems.push({ go: "team", dot: "danger", txt: "AI 직원 루틴 " + lateRoutines.length + "건 멈춤",
          meta: lateRoutines.slice(0, 3).map(function (x) { return x.job.name + "(" + x.st.label + ")"; }).join(", ") +
            (lateRoutines.length > 3 ? " 외" : "") + " · 효제이 AI직원팀에서 확인" });
      }
      var overdueResults = marketResultOverdueList();
      if (overdueResults.length) {
        urgentItems.push({ go: "marketAuction", dot: "warn", txt: "경매 결과 미입력 " + overdueResults.length + "건", meta: overdueResults.slice(0, 3).map(function (m) { return m.buildingName || m.caseNumber; }).join(", ") + (overdueResults.length > 3 ? " 외" : "") + " · 데일리 경매분석에서 유찰/낙찰 입력" });
      }
    return { urgentItems: urgentItems, endedUnpaid: endedUnpaid };
  }

  function renderHome() {
    var s = computeHomeStats();
    var mk = homeSelectedMonth || monthKey();
    var kpi = computeMonthlyKpis(mk);
    var isCurrentMonth = mk === monthKey();
    var today = todayStr();
    var d = parseYMD(today);
    var wd = ["일", "월", "화", "수", "목", "금", "토"][d.getDay()];
    var sched = WEEKDAY_SCHEDULE[d.getDay()];

    var todayRate = s.todayTasks.length ? Math.round((s.todayDone / s.todayTasks.length) * 100) : null;
    var weekRate = s.weekTasks.length ? Math.round((s.weekDone / s.weekTasks.length) * 100) : null;

    var routineEvents = aiWorkLogEvents();
    var _u = buildUrgentItems(s, routineEvents);
    var urgentItems = _u.urgentItems, endedUnpaid = _u.endedUnpaid;

    var endingSoon = courseEndingSoonList(7);

    var html = "";
    html += '<div class="page-head"><div><h1>홈 · 오늘의 업무 요약</h1><div class="sub">부동산팀 안효준 대리 · 종합 현황판</div></div>';
    html += '<div class="today-chip">📅 <b>' + (d.getMonth() + 1) + "월 " + d.getDate() + "일 (" + wd + "요일)</b>" + (sched ? " · 오늘 정규수업: " + sched.cls : " · 오늘 정규수업 없음") + "</div></div>";

    // 라이브 오피스 모드에서는 사무실이 첫 화면이어야 하므로 동기화 알림·긴급 목록보다 위에 둔다.
    // 숫자 카드 묶음은 접어 두고(지도를 안 그리면 officeMapOnPage 가 false 로 남아 애니메이션도 안 돈다).
    var hMode = homeMode();
    homeModeRendered = hMode;
    var officeMode = hMode === "office";
    if (officeMode) html += aiOfficeHomeHtml();
    if (hMode === "staff") html += staffJobBoardHtml(routineEvents);
    html += syncEventsBannerHtml();
    // 대표 할 일 탭에서는 전체 목록이 본문이므로 5건짜리 요약 띠를 겹쳐 보여 주지 않는다.
    if (hMode === "todo") html += todoBoardHtml(urgentItems, endedUnpaid);
    else html += homeActionStripHtml(urgentItems, endedUnpaid);
    html += '<div class="home-board"' + (hMode === "hq" ? "" : " hidden") + ">";
    html += homeHubHtml(s, endingSoon);
    html += weeklyKpiHtml();

    html += '<details class="home-details" id="homeDetails"' + (homeDetailsOpen ? " open" : "") + '><summary>📊 월별 상세 현황 · 세부 목록 (문의·등록 명단, 수업중 인원, 입출금, 광고비, 단계별 현황, 긴급 전체 목록)</summary>';
    html += homeOverviewHtml();

    var months = homeAvailableMonths();
    html += '<div class="month-scroller section-gap">';
    months.forEach(function (mkOpt) {
      html += '<div class="month-card" data-home-month-select="' + mkOpt + '" aria-pressed="' + (mkOpt === mk) + '">';
      html += '<div class="m">' + esc(monthLabel(mkOpt)) + (mkOpt === monthKey() ? " · 이번달" : "") + "</div>";
      html += "</div>";
    });
    html += "</div>";

    html += '<div class="kpi-grid">';
    html += kpiCard((isCurrentMonth ? "이번달" : monthLabel(mk)) + " 신규유입", kpi.newStudents, "명", "newStudents");
    html += kpiCard((isCurrentMonth ? "이번달" : monthLabel(mk)) + " 확정 매출", won(kpi.revenue), "", "revenue");
    html += kpiCard(monthLabel(mk) + " 미수금", won(kpi.unpaidTotal), "(" + kpi.unpaidCount + "건)");
    html += kpiCard(monthLabel(mk) + " 진행중 경매·컨설팅", kpi.activeAuctions, "건");
    html += kpiCard(monthLabel(mk) + " 진행중 대출상담", kpi.activeLoans, "건");
    html += "</div>";

    html += kpiDetailPanel("newStudents", monthLabel(mk) + " 신규유입 상세 (수강생 신청 + 컨설팅 문의)", newStudentBreakdownFor(mk), "newStudents");
    html += kpiDetailPanel("revenue", monthLabel(mk) + " 확정 매출 상세", revenueBreakdownFor(mk), "revenue");

    html += '<div class="card" style="margin-bottom:22px"><h3>' + esc(monthLabel(mk)) + '의 은행 입출금<span class="count">' + kpi.bankMonth.count + "건</span></h3>";
    if (kpi.bankMonth.count === 0) {
      html += '<div class="empty-state">해당 월에 등록된 은행 거래내역이 없습니다.</div>';
    } else {
      html += '<div style="display:flex;gap:32px;flex-wrap:wrap;margin-bottom:14px">';
      html += '<div><div style="font-size:12px;color:var(--ink-soft);font-weight:600">입금 합계</div><div style="font-size:23px;font-weight:800;color:var(--good);font-variant-numeric:tabular-nums">' + won(kpi.bankMonth.deposit) + "</div></div>";
      html += '<div><div style="font-size:12px;color:var(--ink-soft);font-weight:600">출금 합계</div><div style="font-size:23px;font-weight:800;color:var(--danger);font-variant-numeric:tabular-nums">' + won(kpi.bankMonth.withdrawal) + "</div></div>";
      html += "</div>";
      html += '<div class="list-row"><span class="txt">수강료</span><span class="meta">' + won(kpi.bankMonth.tuition) + "</span></div>";
      html += '<div class="list-row"><span class="txt">컨설팅입금</span><span class="meta">' + won(kpi.bankMonth.consulting) + "</span></div>";
      html += '<div class="list-row"><span class="txt">출자금</span><span class="meta">' + won(kpi.bankMonth.capital) + "</span></div>";
      html += '<div class="list-row"><span class="txt">일반입금 · 기타</span><span class="meta">' + won(kpi.bankMonth.general) + "</span></div>";
      if (kpi.bankMonth.reimburse > 0 || kpi.bankMonth.advance > 0) html += '<div class="list-row"><span class="txt">수강생 대납 정산 (매출 제외 · 차액만 순이익 반영)</span><span class="meta">대납 ' + won(kpi.bankMonth.advance) + " → 회수 " + won(kpi.bankMonth.reimburse) + (kpi.bankMonth.advance > kpi.bankMonth.reimburse ? " · 회사몫 " + won(kpi.bankMonth.advance - kpi.bankMonth.reimburse) : "") + "</span></div>";
      html += '<div class="list-row"><span class="txt">광고비</span><span class="meta">' + won(kpi.bankMonth.adSpend) + "</span></div>";
    }
    html += '<div style="margin-top:12px"><button class="btn btn-ghost btn-sm" data-goto="bank">은행 거래내역으로 이동 →</button></div>';
    html += "</div>";

    var adItems = adSpendItemsFor(mk);
    html += '<div class="card" style="margin-bottom:22px"><h3>' + esc(monthLabel(mk)) + '의 광고비 내역<span class="count">' + adItems.length + "건</span></h3>";
    if (adItems.length === 0) {
      html += '<div class="empty-state">해당 월에 페이스북·네이버 광고비 출금내역이 없습니다.</div>';
    } else {
      adItems.forEach(function (t) {
        html += '<div class="list-row"><span class="txt">' + formatShortDate(t.date) + " · " + esc(t.description || "") + '</span><span class="meta">' + won(t.withdrawal) + "</span></div>";
      });
      html += '<div class="list-row" style="border-top:1px solid var(--border);margin-top:6px;padding-top:8px"><span class="txt"><b>합계</b></span><span class="meta"><b>' + won(adItems.reduce(function (sum, t) { return sum + t.withdrawal; }, 0)) + "</b></span></div>";
    }
    html += "</div>";

    html += '<div class="card" style="margin-bottom:22px"><h3>블로그 발행 현황<span class="count">오늘 목표 ' + BLOG_DAILY_GOAL + "건</span></h3>";
    html += '<div style="display:flex;align-items:center;gap:14px;margin-bottom:14px">';
    html += '<div style="font-size:23px;font-weight:800;font-variant-numeric:tabular-nums">' + s.blogToday + ' <span style="font-size:14px;font-weight:600;color:var(--ink-soft)">/ ' + BLOG_DAILY_GOAL + "</span></div>";
    html += pill(s.blogToday >= BLOG_DAILY_GOAL ? "오늘 목표 달성" : "오늘 목표 미달성", s.blogToday >= BLOG_DAILY_GOAL ? "good" : "warn");
    html += "</div>";
    html += '<div class="list-row"><span class="txt">이번주 발행</span><span class="meta">' + s.blogWeek + "건</span></div>";
    html += '<div class="list-row"><span class="txt">이번달 발행</span><span class="meta">' + s.blogMonth + "건</span></div>";
    html += '<div style="margin-top:12px"><button class="btn btn-ghost btn-sm" data-goto="team" data-goto-member="blog">블로그 업무로 이동 →</button></div>';
    html += "</div>";

    html += '<div class="grid-2">';
    html += '<div class="card"><h3>경매 · 컨설팅 단계별 현황<span class="count">전체 ' + state.auctions.length + "건</span></h3>" + stageDistributionHtml(state.auctions, AUCTION_STAGES, "stage") + "</div>";
    html += '<div class="card"><h3>대출상담 단계별 현황<span class="count">전체 ' + state.loans.length + "건</span></h3>" + stageDistributionHtml(state.loans, LOAN_STAGES, "stage") + "</div>";
    html += "</div>";

    html += '<div class="card" style="margin-bottom:22px"><h3>수강 종료 임박 · 갱신 확인<span class="count">' + endingSoon.length + "건</span></h3>";
    html += endingSoon.length
      ? endingSoon.map(function (e) {
          return '<div class="list-row"><span class="dot" style="background:var(--' + (e.kind === "fixed" ? "warn" : "accent") + ')"></span><span class="txt">' + esc(e.name) + " (" + esc(e.level) + ") · " + esc(e.label) + '</span><span class="meta">' + esc(e.meta) + "</span></div>";
        }).join("")
      : '<div class="empty-state">7일 이내 종료 예정이거나 갱신 확인이 필요한 수강생이 없습니다.</div>';
    html += '<div style="margin-top:12px"><button class="btn btn-ghost btn-sm" data-goto="students">수강생 · 매출로 이동 →</button></div>';
    html += "</div>";

    html += '<div class="grid-2">';
    html += '<div class="card"><h3>긴급 처리 필요<span class="count">' + urgentItems.length + "건</span></h3>";
    html += urgentItems.length
      ? urgentItems.slice(0, 8).map(function (u) {
          return '<div class="list-row"><span class="dot" style="background:var(--' + u.dot + ')"></span><span class="txt">' + esc(u.txt) + '</span><span class="meta">' + esc(u.meta) + "</span></div>";
        }).join("")
      : '<div class="empty-state">현재 긴급 처리할 항목이 없습니다.</div>';
    if (endedUnpaid.length) {
      var endedUnpaidTotal = endedUnpaid.reduce(function (sum, st) { return sum + studentUnpaidTotal(st); }, 0);
      html += '<div class="list-row" style="margin-top:4px"><span class="dot" style="background:var(--neutral-ink)"></span><span class="txt">과정 종료 후 미수금 (긴급 아님)</span><span class="meta">' + endedUnpaid.length + "건 · " + won(endedUnpaidTotal) + "</span></div>";
    }
    html += "</div>";

    html += '<div class="card"><h3>오늘 · 이번주 체크리스트 완료율</h3>';
    html += '<div class="list-row"><span class="txt">오늘 (' + formatShortDate(today) + ")</span><span class=\"meta\">" + s.todayDone + "/" + s.todayTasks.length + "건</span>" + (todayRate === null ? pill("등록없음", "neutral") : pill(todayRate + "%", todayRate === 100 ? "good" : "warn")) + "</div>";
    html += '<div class="list-row"><span class="txt">이번주</span><span class="meta">' + s.weekDone + "/" + s.weekTasks.length + "건</span>" + (weekRate === null ? pill("등록없음", "neutral") : pill(weekRate + "%", weekRate === 100 ? "good" : "warn")) + "</div>";
    html += '<div style="margin-top:12px"><button class="btn btn-ghost btn-sm" data-goto="tasks">체크리스트로 이동 →</button></div>';
    html += "</div></div>";
    html += "</details>";
    html += "</div>";

    document.getElementById("main").innerHTML = html;
    Array.prototype.forEach.call(document.querySelectorAll("[data-goto]"), function (btn) {
      btn.addEventListener("click", function () {
        currentView = btn.getAttribute("data-goto");
        teamMemberView = btn.getAttribute("data-goto-member") || null;
        if (btn.hasAttribute("data-open-wizard")) { wizardOpen = true; wizardStep = 1; wizardData = wizardDefaults(); }
        render();
      });
    });
    Array.prototype.forEach.call(document.querySelectorAll("[data-home-mode]"), function (btn) {
      btn.addEventListener("click", function () {
        state.meta[homeModeKey()] = btn.getAttribute("data-home-mode");
        persistLocal();
        render();
        window.scrollTo(0, 0);
      });
    });
    bindWeeklyKpi();
    bindOfficeMap();
    if (officePaused()) {
      officeSimStop();
      // 멈춤이어도 화면에는 서 있어야 한다. 한 프레임만 그려 마지막 위치에 세워 둔다.
      if (!officeSim) officeSim = officeSimInit();
      if (document.getElementById("officeAgents")) officeSimDraw();
    } else officeSimStart();
    var homeDetailsEl = document.getElementById("homeDetails");
    if (homeDetailsEl) {
      homeDetailsEl.addEventListener("toggle", function () { homeDetailsOpen = homeDetailsEl.open; });
    }
    Array.prototype.forEach.call(document.querySelectorAll("[data-sync-banner-dismiss]"), function (btn) {
      btn.addEventListener("click", function () {
        state.meta.syncEventsSeenAt = new Date().toISOString();
        persistLocal();
        render();
      });
    });
    Array.prototype.forEach.call(document.querySelectorAll("[data-home-month-select]"), function (el) {
      el.addEventListener("click", function () {
        var picked = el.getAttribute("data-home-month-select");
        homeSelectedMonth = picked === monthKey() ? null : picked;
        render();
      });
    });
    Array.prototype.forEach.call(document.querySelectorAll("[data-kpi-toggle]"), function (el) {
      el.addEventListener("click", function () {
        var key = el.getAttribute("data-kpi-toggle");
        homeKpiDetailOpen[key] = !homeKpiDetailOpen[key];
        render();
      });
      el.addEventListener("keydown", function (e) {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); el.click(); }
      });
    });
    Array.prototype.forEach.call(document.querySelectorAll("[data-kpi-item-toggle]"), function (cb) {
      cb.addEventListener("change", function () {
        var group = cb.getAttribute("data-kpi-item-toggle");
        var key = cb.getAttribute("data-kpi-item-key");
        var exclusions = ensureKpiExclusions()[group];
        if (cb.checked) delete exclusions[key];
        else exclusions[key] = true;
        saveState(); render();
      });
    });
  }

  function kpiCard(label, value, unit, toggleKey) {
    var clickable = toggleKey ? ' data-kpi-toggle="' + toggleKey + '" style="cursor:pointer" role="button" tabindex="0"' : "";
    var hint = toggleKey ? '<div class="kpi-hint">' + (homeKpiDetailOpen[toggleKey] ? "▴ 상세 접기" : "▾ 상세보기") + "</div>" : "";
    return '<div class="kpi-card"' + clickable + '><div class="label">' + esc(label) + '</div><div class="value">' + value + (unit ? " <small>" + esc(unit) + "</small>" : "") + "</div>" + hint + "</div>";
  }
  function kpiDetailPanel(toggleKey, title, items, exclusionGroup) {
    if (!homeKpiDetailOpen[toggleKey]) return "";
    var total = items.reduce(function (sum, it) { return it.checked && typeof it.amount === "number" ? sum + it.amount : sum; }, 0);
    var hasAmount = items.length && typeof items[0].amount === "number";
    var html = '<div class="card section-gap"><h3>' + esc(title) + '<span class="count">' + items.length + "건</span></h3>";
    if (items.length === 0) {
      html += '<div class="empty-state">해당하는 항목이 없습니다.</div>';
    } else {
      items.forEach(function (it) {
        html += '<label class="list-row" style="cursor:pointer"><span class="txt"><input type="checkbox" data-kpi-item-toggle="' + exclusionGroup + '" data-kpi-item-key="' + esc(it.key) + '" ' + (it.checked ? "checked" : "") + "> " + esc(it.label) + "</span><span class=\"meta\">" + (it.amount !== null ? won(it.amount) : (it.meta || "")) + "</span></label>";
      });
      if (hasAmount) {
        html += '<div class="list-row" style="border-top:1px solid var(--border);margin-top:6px;padding-top:8px"><span class="txt"><b>체크된 합계</b></span><span class="meta"><b>' + won(total) + "</b></span></div>";
      } else {
        html += '<div class="list-row" style="border-top:1px solid var(--border);margin-top:6px;padding-top:8px"><span class="txt"><b>체크된 인원</b></span><span class="meta"><b>' + items.filter(function (it) { return it.checked; }).length + "명</b></span></div>";
      }
    }
    html += "</div>";
    return html;
  }

  /* ---------------- Students ---------------- */
  function studentRevenueMonth(s) {
    return s.paidDate || s.appliedDate || "";
  }
  function ensureKpiExclusions() {
    if (!state.meta.kpiExclusions) state.meta.kpiExclusions = {};
    if (!state.meta.kpiExclusions.revenue) state.meta.kpiExclusions.revenue = {};
    if (!state.meta.kpiExclusions.newStudents) state.meta.kpiExclusions.newStudents = {};
    return state.meta.kpiExclusions;
  }
  function revenueBreakdownFor(mk) {
    var exclusions = ensureKpiExclusions().revenue;
    var items = [];
    state.students.forEach(function (s) {
      if (s.paymentType === "월별") {
        (s.installments || []).forEach(function (i) {
          if (i.paid && i.month === mk) {
            var key = "installment:" + s.id + ":" + i.id;
            items.push({ key: key, label: s.name + " · " + i.round + "회차", amount: Number(i.amount) || 0, checked: !exclusions[key] });
          }
        });
      } else if (s.paid) {
        var rm = studentRevenueMonth(s);
        if (rm && rm.slice(0, 7) === mk) {
          var key2 = "tuition:" + s.id;
          items.push({ key: key2, label: s.name + " · 수강료", amount: Number(s.tuition) || 0, checked: !exclusions[key2] });
        }
      }
    });
    state.transactions.forEach(function (t) {
      if (t.category === "consulting" && t.date && t.date.slice(0, 7) === mk) {
        var key3 = "consulting:" + t.id;
        items.push({ key: key3, label: (t.description || "컨설팅입금") + " · 컨설팅", amount: Number(t.deposit) || 0, checked: !exclusions[key3] });
      }
    });
    return items;
  }
  function newStudentBreakdownFor(mk) {
    var exclusions = ensureKpiExclusions().newStudents;
    var items = state.students.filter(function (s) { return s.appliedDate && s.appliedDate.slice(0, 7) === mk; })
      .map(function (s) {
        var key = "newstudent:" + s.id;
        return { key: key, label: s.name, amount: null, meta: formatShortDate(s.appliedDate), sortDate: s.appliedDate, checked: !exclusions[key] };
      });
    // 경매 · 컨설팅 탭에서 "컨설팅" 문의로 새로 등록된 건도 신규유입으로 함께 집계한다.
    state.auctions.filter(function (a) {
      return a.kind === "컨설팅" && (a.createdAt || "").slice(0, 7) === mk;
    }).forEach(function (a) {
      var key = "newconsulting:" + a.id;
      var d = (a.createdAt || "").slice(0, 10);
      items.push({ key: key, label: (a.client || "이름 미상") + " (컨설팅 문의)", amount: null, meta: formatShortDate(d), sortDate: d, checked: !exclusions[key] });
    });
    items.sort(function (a, b) { return (a.sortDate || "").localeCompare(b.sortDate || ""); });
    return items;
  }
  function monthlyRevenueFor(mk) {
    return revenueBreakdownFor(mk).reduce(function (sum, it) { return it.checked ? sum + it.amount : sum; }, 0);
  }
  function studentUnpaidTotal(s) {
    if (s.paymentType === "월별") {
      return (s.installments || []).filter(function (i) { return !i.paid; }).reduce(function (sum, i) { return sum + (Number(i.amount) || 0); }, 0);
    }
    return s.paid ? 0 : (Number(s.tuition) || 0);
  }
  function studentHasUnpaid(s) {
    if (s.paymentType === "월별") return (s.installments || []).some(function (i) { return !i.paid; });
    return !s.paid;
  }
  // 초급반·중급반은 5주 완성 과정이라 신청일 기준 종료 예정일이 지나면 "종료"로 본다.
  // 고급반·낙찰반·컨설팅반은 정해진 종료 시점이 없는 과정이라 항상 "진행중"으로 취급한다
  // (courseEndingSoonList와 같은 기준 — 월별 회차 미납 여부로 따로 갱신을 확인함).
  function studentCourseStatus(s) {
    var weeks = FIXED_COURSE_WEEKS[s.level];
    // 기수(반)마다 개강일이 따로 있고, 신청일과 다를 수 있다 — courseStartDate가 지정돼 있으면
    // 그걸 우선 쓰고, 아직 지정 안 된 학생(과거 데이터 포함)은 기존처럼 신청일로 계산한다.
    var startDate = s.courseStartDate || s.appliedDate;
    if (weeks && startDate) {
      var endDate = addDaysToDateStr(startDate, weeks * 7);
      return todayStr() > endDate ? "종료" : "진행중";
    }
    return "진행중";
  }
  function courseStartToolHtml() {
    var levels = Object.keys(FIXED_COURSE_WEEKS);
    var pool = state.students.filter(function (s) { return s.level === courseStartLevel; });
    pool = pool.slice().sort(function (a, b) { return (a.name || "").localeCompare((b.name || ""), "ko"); });
    var html = '<div class="card section-gap"><h3>🗓 반 개강일(기수) 설정</h3>';
    html += '<div class="sub" style="margin-bottom:12px">초급반·중급반은 5주 과정이고, 기수마다 개강일이 달라집니다. 신청일과는 별개로, 같은 기수 학생을 선택해 개강일을 한 번에 지정하세요. 지정하지 않으면 신청일 기준으로 계산됩니다.</div>';
    html += '<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:flex-end;margin-bottom:12px">';
    html += field("반", '<select id="courseStartLevelSelect" class="inline-select">' +
      levels.map(function (l) { return '<option value="' + esc(l) + '"' + (l === courseStartLevel ? " selected" : "") + '>' + esc(l) + "</option>"; }).join("") +
      "</select>");
    html += field("개강일", '<input type="date" id="courseStartDateInput" class="inline-select">');
    html += '<button type="button" class="btn btn-primary btn-sm" id="courseStartApplyBtn">선택한 학생에 적용</button>';
    html += "</div>";
    if (pool.length === 0) {
      html += '<div class="empty-state">' + esc(courseStartLevel) + " 학생이 없습니다.</div>";
    } else {
      html += '<div style="max-height:240px;overflow-y:auto;border:1px solid var(--border);border-radius:8px;padding:8px 10px">';
      pool.forEach(function (s) {
        var checked = !!courseStartSelectedIds[s.id];
        html += '<label class="multi-select-item" style="display:flex;align-items:center;gap:8px;padding:4px 0">';
        html += '<input type="checkbox" data-course-start-pick="' + s.id + '"' + (checked ? " checked" : "") + ">";
        html += '<span style="flex:1">' + esc(s.name) + "</span>";
        html += '<span class="meta" style="font-size:11px;color:var(--ink-faint)">신청 ' + formatShortDate(s.appliedDate) +
          (s.courseStartDate ? " · 개강일 " + formatShortDate(s.courseStartDate) : "") + "</span>";
        html += "</label>";
      });
      html += "</div>";
    }
    html += "</div>";
    return html;
  }
  function isRevenueConfirmedStudent(s) {
    if (s.status !== "등록완료") return false;
    if (s.paymentType === "월별") return (s.installments || []).some(function (i) { return i.paid; });
    return !!s.paid;
  }
  function isRevenueConfirmedWithAmount(s) {
    // paid 플래그만으로는 부족하다 — 이전 과정에서 금액이 0원인데 paid=true로 남아있는
    // 사례(8/5 대량이전 학생 일부)가 있어, 실제 입금액이 0보다 큰 경우만 매출로 인정한다.
    if (!isRevenueConfirmedStudent(s)) return false;
    if (s.paymentType === "월별") {
      return (s.installments || []).some(function (i) { return i.paid && (i.amount || 0) > 0; });
    }
    return (s.tuition || 0) > 0;
  }
  function addDaysToDateStr(dateStr, days) {
    var d = parseYMD(dateStr);
    d.setDate(d.getDate() + days);
    return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate());
  }
  function courseEndingSoonList(withinDays) {
    withinDays = withinDays || 7;
    var today = todayStr();
    var mk = monthKey();
    var results = [];
    state.students.forEach(function (s) {
      if (!isRevenueConfirmedStudent(s)) return;
      var weeks = FIXED_COURSE_WEEKS[s.level];
      if (weeks) {
        // 초급반·중급반: 5주 고정 과정, appliedDate 기준 종료 예정일이 임박했으면 재등록/다음 반 안내 대상.
        // 단, 등록일로부터 30일이 지난 뒤에는 갱신 여부와 상관없이 목록에서 빠진다(오래된 항목이 계속 남지 않게).
        if (!s.appliedDate) return;
        if (daysBetween(s.appliedDate, today) > 30) return;
        var endDate = addDaysToDateStr(s.appliedDate, weeks * 7);
        var daysLeft = daysBetween(today, endDate);
        if (daysLeft > withinDays) return;
        results.push({
          id: s.id, name: s.name, level: s.level, kind: "fixed", sortKey: daysLeft,
          label: daysLeft < 0 ? "종료일 " + Math.abs(daysLeft) + "일 지남" : daysLeft === 0 ? "오늘 종료 예정" : daysLeft + "일 후 종료 예정",
          meta: "종료 예정일 " + formatShortDate(endDate)
        });
      } else if (MONTHLY_LEVELS[s.level]) {
        // 고급반·낙찰반: 월결제, 아무 때나 종료 가능한 과정이라 "이번달 회차"가 있는지·납부됐는지로 갱신 여부를 확인한다
        var thisMonthInst = (s.installments || []).find(function (i) { return i.month === mk; });
        if (thisMonthInst && thisMonthInst.paid) return;
        results.push({
          id: s.id, name: s.name, level: s.level, kind: "monthly", sortKey: 100,
          label: thisMonthInst ? "이번달 회차 미납" : "이번달 회차 미생성 · 갱신 확인 필요",
          meta: "월결제 과정"
        });
      }
      // 컨설팅반(1:1) 등은 정해진 종료 개념이 없어 대상에서 제외
    });
    results.sort(function (a, b) { return a.sortKey - b.sortKey; });
    return results;
  }
  function studentNextUnpaidInstallment(s) {
    if (s.paymentType !== "월별") return null;
    var list = (s.installments || []).filter(function (i) { return !i.paid; }).sort(function (a, b) { return a.round - b.round; });
    return list.length ? list[0] : null;
  }
  function monthLabelShort(mk) {
    if (!mk) return "-";
    var parts = mk.split("-");
    return parts[0] + "." + parts[1];
  }

  function renderStudents() {
    var mk = monthKey();
    var filteredStudents = studentStatusFilter === "all" ? state.students
      : studentStatusFilter === "paid" ? state.students.filter(isRevenueConfirmedStudent)
      : state.students.filter(function (s) { return s.status === studentStatusFilter; });
    if (studentCourseStatusFilter !== "all") {
      filteredStudents = filteredStudents.filter(function (s) { return studentCourseStatus(s) === studentCourseStatusFilter; });
    }
    var dupNamesStudents = buildDupNameMap(filteredStudents);
    var monthRevenue = monthlyRevenueFor(mk);
    var lumpCount = filteredStudents.filter(function (s) { return s.paymentType !== "월별"; }).length;
    var monthlyCount = filteredStudents.length - lumpCount;
    var unpaidStudents = filteredStudents.filter(studentHasUnpaid);

    var html = "";
    html += '<div class="page-head"><div><h1>수강생 · 매출 실적</h1><div class="sub">초급 · 중급 · 고급반(오프라인/온라인) · 낙찰반 · 컨설팅반 신청 현황과 수강료 입금 관리</div></div></div>';

    html += '<div class="kpi-grid cols-5">';
    html += kpiCard(studentStatusFilter === "all" ? "전체 수강생" : studentStatusFilter === "paid" ? "입금·수강생" : studentStatusFilter + " 수강생", filteredStudents.length, "명");
    html += kpiCard("이번달 확정 매출", won(monthRevenue), "");
    html += kpiCard("단발성 / 월별", lumpCount + " / " + monthlyCount, "명");
    html += kpiCard("미입금", unpaidStudents.length, "명");
    html += kpiCard("수강생 DB 등록", state.studentDb.length, "명");
    html += "</div>";

    html += '<div class="card" style="margin-bottom:22px"><h3>반별 인원<span class="count">' + filteredStudents.length + "명</span></h3>" + stageDistributionHtml(filteredStudents, STUDENT_LEVELS, "level") + "</div>";

    html += courseStartToolHtml();

    html += '<div class="backup-note" style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap">';
    html += '<span>새 수강생은 이 탭에서 바로 추가하지 않습니다. <b>수강생 DB</b>에 먼저 등록한 뒤 "+ 매출 등록"으로 연결하고, <b>은행 거래내역</b>에서 입금 건을 그 학생과 연결하면 여기 매출 목록에 자동으로 나타납니다.</span>';
    html += '<span style="display:flex;gap:8px;flex-shrink:0"><button type="button" class="btn btn-ghost btn-sm" data-goto="studentDb">수강생 DB로 이동 →</button><button type="button" class="btn btn-ghost btn-sm" data-goto="bank">은행 거래내역으로 이동 →</button></span>';
    html += "</div>";

    html += '<div class="filter-bar">';
    html += '<input type="text" id="studentsSearchInput" class="inline-select" placeholder="🔍 이름·반·메모 검색" value="' + esc(studentsSearchQuery) + '" style="min-width:260px;flex:1">';
    html += "</div>";

    html += '<div class="filter-bar">' + ["paid", "all"].concat(STUDENT_STATUS).map(function (st) {
      var label = st === "all" ? "전체 (미입금·상담중 포함)" : st === "paid" ? "입금·수업진행 확인됨" : st;
      var n = st === "all" ? state.students.length : st === "paid" ? state.students.filter(isRevenueConfirmedStudent).length : state.students.filter(function (s) { return s.status === st; }).length;
      return '<button class="filter-chip" data-student-status-filter="' + esc(st) + '" aria-pressed="' + (studentStatusFilter === st) + '">' + esc(label) + " (" + n + ")</button>";
    }).join("") + "</div>";

    html += '<div class="filter-bar">' + ["all", "진행중", "종료"].map(function (cs) {
      var label = cs === "all" ? "수강상태 전체" : cs === "진행중" ? "진행중" : "종료됨";
      var pool = studentStatusFilter === "all" ? state.students
        : studentStatusFilter === "paid" ? state.students.filter(isRevenueConfirmedStudent)
        : state.students.filter(function (s) { return s.status === studentStatusFilter; });
      var n = cs === "all" ? pool.length : pool.filter(function (s) { return studentCourseStatus(s) === cs; }).length;
      return '<button class="filter-chip" data-student-course-status-filter="' + cs + '" aria-pressed="' + (studentCourseStatusFilter === cs) + '">' + esc(label) + " (" + n + ")</button>";
    }).join("") + "</div>";

    var studentsSearchNeedle = studentsSearchQuery.trim().toLowerCase();
    var displayStudents = !studentsSearchNeedle ? filteredStudents : filteredStudents.filter(function (s) {
      var haystack = [s.name, s.level, s.memo].join(" ").toLowerCase();
      return haystack.indexOf(studentsSearchNeedle) !== -1;
    });

    var STUDENTS_COLSPAN = 9;
    html += '<div class="table-wrap"><table class="data-table mobile-fit"><thead><tr><th></th><th>이름</th><th>반</th><th>수강상태</th><th class="col-mobile-hide">수강과정(DB)</th><th class="col-mobile-hide">결제방식</th><th class="col-mobile-hide">신청일</th><th>입금현황</th><th></th></tr></thead><tbody>';
    if (displayStudents.length === 0) {
      html += '<tr><td colspan="' + STUDENTS_COLSPAN + '"><div class="empty-state">' + (studentsSearchNeedle ? "검색 결과가 없습니다." : state.students.length ? "해당 상태의 수강생이 없습니다." : "등록된 수강생이 없습니다. 수강생 DB에서 먼저 등록해주세요.") + "</div></td></tr>";
    } else {
      var studentDbById = {};
      state.studentDb.forEach(function (d) { studentDbById[d.id] = d; });
      displayStudents.slice().sort(function (a, b) { return (a.name || "").localeCompare((b.name || ""), "ko"); }).forEach(function (s) {
        var isMonthly = s.paymentType === "월별";
        var isOpen = !!studentExpandedIds[s.id];
        var totalInst = (s.installments || []).length;
        var paidInst = (s.installments || []).filter(function (i) { return i.paid; }).length;
        var unpaidT = studentUnpaidTotal(s);
        var linkedDb = s.studentDbId ? studentDbById[s.studentDbId] : null;
        var coursePills = linkedDb ? STUDENT_DB_COURSE_KEYS.filter(function (k) { return linkedDb.courses && linkedDb.courses[k]; })
          .map(function (k) { return pill(STUDENT_DB_COURSE_LABELS[k], STUDENT_DB_COURSE_PILL[k]); }).join(" ") : "";
        html += "<tr>";
        html += '<td><button class="icon-btn" data-student-toggle="' + s.id + '" aria-label="상세 보기·수정" style="color:var(--brand)">' + (isOpen ? "▾" : "▸") + "</button></td>";
        html += "<td><b>" + esc(dupNamesStudents[s.id] || s.name) + "</b>" + (s.studentDbId ? " " + pill("🔗 DB", "neutral") : "") + "</td>";
        html += "<td>" + esc(s.level) + "</td>";
        var courseStatus = studentCourseStatus(s);
        html += "<td>" + pill(courseStatus, courseStatus === "진행중" ? "brand" : "neutral") + "</td>";
        html += '<td class="col-mobile-hide">' + (coursePills || '<span class="meta">-</span>') + "</td>";
        html += '<td class="col-mobile-hide">' + pill(s.paymentType, isMonthly ? "brand" : "neutral") + "</td>";
        html += '<td class="col-mobile-hide">' + (s.appliedDate ? formatShortDate(s.appliedDate) : "-") + "</td>";
        if (isMonthly) {
          html += "<td>" + pill(paidInst + "/" + totalInst + " 회차 완납", totalInst > 0 && unpaidT === 0 ? "good" : "warn") + (unpaidT > 0 ? ' <span class="meta">미납 ' + won(unpaidT) + "</span>" : "") + "</td>";
        } else {
          html += "<td>" + pill(s.paid ? "입금완료" : "미입금", s.paid ? "good" : "warn") + "</td>";
        }
        html += '<td><div class="row-actions"><button class="icon-btn" data-del="student" data-id="' + s.id + '" aria-label="삭제">✕</button></div></td>';
        html += "</tr>";
        if (isOpen) {
          html += '<tr><td colspan="' + STUDENTS_COLSPAN + '"><div style="padding:14px;background:var(--surface-2);border:1px solid var(--border);border-radius:8px;display:flex;flex-wrap:wrap;gap:10px">';
          html += field("이름", '<input type="text" class="inline-select" data-inline-text="name" data-id="' + s.id + '" data-entity="student" value="' + esc(s.name || "") + '">');
          html += field("반", selectHtml("level", STUDENT_LEVELS, s.level, s.id, "student"));
          html += field("결제방식", selectHtml("paymentType", PAYMENT_TYPES, s.paymentType, s.id, "student"));
          html += field("신청일", '<input type="date" class="inline-select" data-inline-date="appliedDate" data-id="' + s.id + '" data-entity="student" value="' + esc(s.appliedDate) + '">');
          if (FIXED_COURSE_WEEKS[s.level]) {
            html += field("개강일(기수)", '<input type="date" class="inline-select" data-inline-date="courseStartDate" data-id="' + s.id + '" data-entity="student" value="' + esc(s.courseStartDate || "") + '">');
          }
          html += field("상태", selectHtml("status", STUDENT_STATUS, s.status, s.id, "student"));
          if (isMonthly) {
            html += field("월 금액(원)", '<input type="number" class="inline-select" min="0" step="10000" data-inline-number="monthlyAmount" data-id="' + s.id + '" data-entity="student" value="' + s.monthlyAmount + '">');
          } else {
            html += field("수강료(원)", '<input type="number" class="inline-select" min="0" step="10000" data-inline-number="tuition" data-id="' + s.id + '" data-entity="student" value="' + s.tuition + '">');
            html += field("입금완료", '<input type="checkbox" data-toggle="paid" data-id="' + s.id + '" ' + (s.paid ? "checked" : "") + ">");
            html += field("입금일", '<input type="date" class="inline-select" data-inline-date="paidDate" data-id="' + s.id + '" data-entity="student" value="' + esc(s.paidDate || "") + '">');
            html += field("계산서발행", '<input type="checkbox" data-toggle="taxInvoice" data-id="' + s.id + '" ' + (s.taxInvoice ? "checked" : "") + ">");
            html += field("카드결제", '<input type="checkbox" data-toggle="cardPayment" data-id="' + s.id + '" ' + (s.cardPayment ? "checked" : "") + ">");
          }
          html += field("메모", '<input type="text" class="inline-select" data-inline-text="memo" data-id="' + s.id + '" data-entity="student" value="' + esc(s.memo || "") + '" placeholder="메모">', "grow");
          html += "</div></td></tr>";
        }
        if (isMonthly && isOpen) {
          html += '<tr><td colspan="' + STUDENTS_COLSPAN + '"><div style="padding:12px;background:var(--surface-2);border:1px solid var(--border);border-radius:8px">';
          html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px"><b style="font-size:13px">' + esc(dupNamesStudents[s.id] || s.name) + ' 회차별 결제 현황</b><button class="btn btn-primary btn-sm" data-add-installment="' + s.id + '">+ 다음 회차 추가</button></div>';
          var insts = (s.installments || []).slice().sort(function (a, b) { return a.round - b.round; });
          if (insts.length === 0) {
            html += '<div class="empty-state">등록된 회차가 없습니다. "다음 회차 추가"로 시작해보세요.</div>';
          } else {
            html += '<div class="table-wrap"><table class="data-table"><thead><tr><th>회차</th><th>해당월</th><th>금액</th><th>입금</th><th>계산서</th><th>카드결제</th><th></th></tr></thead><tbody>';
            insts.forEach(function (i) {
              html += "<tr>";
              html += "<td>" + i.round + "회차</td>";
              html += '<td><input type="month" data-inst-field="month" data-student-id="' + s.id + '" data-inst-id="' + i.id + '" value="' + esc(i.month || "") + '"></td>';
              html += '<td class="num"><input type="number" min="0" step="10000" style="text-align:right;max-width:110px" data-inst-field="amount" data-student-id="' + s.id + '" data-inst-id="' + i.id + '" value="' + i.amount + '"></td>';
              html += '<td><input type="checkbox" data-inst-toggle="paid" data-student-id="' + s.id + '" data-inst-id="' + i.id + '" ' + (i.paid ? "checked" : "") + "></td>";
              html += '<td><input type="checkbox" data-inst-toggle="taxInvoice" data-student-id="' + s.id + '" data-inst-id="' + i.id + '" ' + (i.taxInvoice ? "checked" : "") + "></td>";
              html += '<td><input type="checkbox" data-inst-toggle="cardPayment" data-student-id="' + s.id + '" data-inst-id="' + i.id + '" ' + (i.cardPayment ? "checked" : "") + "></td>";
              html += '<td><button class="icon-btn" data-inst-del data-student-id="' + s.id + '" data-inst-id="' + i.id + '" aria-label="회차 삭제">✕</button></td>';
              html += "</tr>";
            });
            html += "</tbody></table></div>";
          }
          html += "</div></td></tr>";
        }
      });
    }
    html += "</tbody></table></div>";

    document.getElementById("main").innerHTML = html;

    Array.prototype.forEach.call(document.querySelectorAll("[data-goto]"), function (btn) {
      btn.addEventListener("click", function () {
        currentView = btn.getAttribute("data-goto");
        render();
      });
    });

    Array.prototype.forEach.call(document.querySelectorAll("[data-student-toggle]"), function (btn) {
      btn.addEventListener("click", function () {
        var id = btn.getAttribute("data-student-toggle");
        studentExpandedIds[id] = !studentExpandedIds[id];
        render();
      });
    });
    Array.prototype.forEach.call(document.querySelectorAll("[data-add-installment]"), function (btn) {
      btn.addEventListener("click", function () {
        var s = state.students.find(function (x) { return x.id === btn.getAttribute("data-add-installment"); });
        if (!s) return;
        s.installments = s.installments || [];
        s.installments.push({
          id: uid(), round: s.installments.length + 1, month: monthKey(),
          amount: s.monthlyAmount || 0, paid: false, taxInvoice: false, cardPayment: false
        });
        studentExpandedIds[s.id] = true;
        saveState(); render();
      });
    });
    Array.prototype.forEach.call(document.querySelectorAll("[data-inst-field]"), function (inp) {
      inp.addEventListener("change", function () {
        var s = state.students.find(function (x) { return x.id === inp.getAttribute("data-student-id"); });
        if (!s) return;
        var inst = (s.installments || []).find(function (x) { return x.id === inp.getAttribute("data-inst-id"); });
        if (!inst) return;
        var field = inp.getAttribute("data-inst-field");
        inst[field] = field === "amount" ? (Number(inp.value) || 0) : inp.value;
        saveState(); render();
      });
    });
    Array.prototype.forEach.call(document.querySelectorAll("[data-inst-toggle]"), function (cb) {
      cb.addEventListener("change", function () {
        var s = state.students.find(function (x) { return x.id === cb.getAttribute("data-student-id"); });
        if (!s) return;
        var inst = (s.installments || []).find(function (x) { return x.id === cb.getAttribute("data-inst-id"); });
        if (!inst) return;
        inst[cb.getAttribute("data-inst-toggle")] = cb.checked;
        saveState(); render();
      });
    });
    Array.prototype.forEach.call(document.querySelectorAll("[data-inst-del]"), function (btn) {
      btn.addEventListener("click", function () {
        customConfirm("이 회차를 삭제하시겠습니까?", function () {
          var s = state.students.find(function (x) { return x.id === btn.getAttribute("data-student-id"); });
          if (!s) return;
          s.installments = (s.installments || []).filter(function (x) { return x.id !== btn.getAttribute("data-inst-id"); });
          saveState(); render();
        });
      });
    });

    Array.prototype.forEach.call(document.querySelectorAll("[data-student-course-status-filter]"), function (btn) {
      btn.addEventListener("click", function () { studentCourseStatusFilter = btn.getAttribute("data-student-course-status-filter"); render(); });
    });
    Array.prototype.forEach.call(document.querySelectorAll("[data-student-status-filter]"), function (btn) {
      btn.addEventListener("click", function () { studentStatusFilter = btn.getAttribute("data-student-status-filter"); render(); });
    });

    var courseStartLevelSelectEl = document.getElementById("courseStartLevelSelect");
    if (courseStartLevelSelectEl) {
      courseStartLevelSelectEl.addEventListener("change", function () {
        courseStartLevel = courseStartLevelSelectEl.value;
        courseStartSelectedIds = {};
        render();
      });
    }
    Array.prototype.forEach.call(document.querySelectorAll("[data-course-start-pick]"), function (cb) {
      cb.addEventListener("change", function () {
        var id = cb.getAttribute("data-course-start-pick");
        if (cb.checked) courseStartSelectedIds[id] = true; else delete courseStartSelectedIds[id];
      });
    });
    var courseStartApplyBtnEl = document.getElementById("courseStartApplyBtn");
    if (courseStartApplyBtnEl) {
      courseStartApplyBtnEl.addEventListener("click", function () {
        var dateInput = document.getElementById("courseStartDateInput");
        var dateVal = dateInput ? dateInput.value : "";
        var ids = Object.keys(courseStartSelectedIds).filter(function (id) { return courseStartSelectedIds[id]; });
        if (!dateVal) { toast("개강일을 먼저 선택해주세요."); return; }
        if (ids.length === 0) { toast("적용할 학생을 선택해주세요."); return; }
        ids.forEach(function (id) {
          var s = state.students.find(function (x) { return x.id === id; });
          if (s) s.courseStartDate = dateVal;
        });
        courseStartSelectedIds = {};
        saveState();
        toast(ids.length + "명의 개강일을 " + formatShortDate(dateVal) + "로 설정했습니다.");
        render();
      });
    }

    var studentsSearchEl = document.getElementById("studentsSearchInput");
    if (studentsSearchEl) {
      var studentsSearchComposing = false;
      var studentsSearchDebounceTimer = null;
      var runStudentsSearch = function () {
        studentsSearchQuery = studentsSearchEl.value;
        var cursorPos = studentsSearchEl.selectionStart;
        render();
        var newSearchEl = document.getElementById("studentsSearchInput");
        if (newSearchEl) { newSearchEl.focus(); newSearchEl.setSelectionRange(cursorPos, cursorPos); }
      };
      var scheduleStudentsSearch = function () {
        if (studentsSearchDebounceTimer) clearTimeout(studentsSearchDebounceTimer);
        studentsSearchDebounceTimer = setTimeout(runStudentsSearch, 250);
      };
      studentsSearchEl.addEventListener("compositionstart", function () {
        studentsSearchComposing = true;
        if (studentsSearchDebounceTimer) { clearTimeout(studentsSearchDebounceTimer); studentsSearchDebounceTimer = null; }
      });
      studentsSearchEl.addEventListener("compositionend", function () { studentsSearchComposing = false; scheduleStudentsSearch(); });
      studentsSearchEl.addEventListener("input", function (e) {
        if (studentsSearchComposing || (e && e.isComposing)) return;
        scheduleStudentsSearch();
      });
    }

    bindTableCommon("student");
  }

  /* ---------------- Auctions ---------------- */
  function auctionsSectionHtml() {
    var filtered = auctionFilterStage === "all" ? state.auctions : state.auctions.filter(function (a) { return a.stage === auctionFilterStage; });

    var html = "";
    html += '<div class="sub" style="margin:-4px 0 12px">물건조사부터 잔금완료까지 단계별 진행 관리</div>';

    html += '<form class="add-form" id="auctionForm">';
    html += field("고객명", '<input type="text" name="client" placeholder="예: 김투자" required>');
    html += field("구분", selectHtml("kind", ["경매", "컨설팅"], "경매"));
    html += field("물건지", '<input type="text" name="address" placeholder="예: 경기 광주시 ○○동">', "grow");
    html += field("진행단계", selectHtml("stage", AUCTION_STAGES, AUCTION_STAGES[0]));
    html += field("금액(원)", '<input type="number" name="price" min="0" step="1000000" placeholder="예상 낙찰가">');
    html += field("메모", '<input type="text" name="memo" placeholder="진행 메모">', "grow");
    html += '<button type="submit" class="btn btn-primary">+ 건 추가</button>';
    html += "</form>";

    html += '<div class="filter-bar">' + ["all"].concat(AUCTION_STAGES).map(function (st) {
      var label = st === "all" ? "전체" : st;
      return '<button class="filter-chip" data-stage-filter="' + st + '" aria-pressed="' + (auctionFilterStage === st) + '">' + esc(label) + "</button>";
    }).join("") + "</div>";

    var sorted = filtered.slice().sort(function (a, b) { return (b.updatedAt || "").localeCompare(a.updatedAt || ""); });
    if (sorted.length === 0) {
      html += '<div class="empty-state">해당하는 경매·컨설팅 건이 없습니다.</div>';
    } else {
      html += '<div class="stage-card-grid">';
      sorted.forEach(function (a) {
        html += '<div class="stage-card" data-auction-card="' + a.id + '" role="button" tabindex="0">';
        html += '<button type="button" class="icon-btn stage-card-del" data-del="auction" data-id="' + a.id + '" aria-label="삭제">✕</button>';
        html += '<div class="stage-card-top"><div class="stage-card-name">' + esc(a.client || "(이름 없음)") + '</div></div>';
        html += '<div class="stage-card-pills">' + pill(a.kind, a.kind === "컨설팅" ? "brand" : "neutral") + pill(a.stage, AUCTION_STAGE_PILL[a.stage] || "neutral") + "</div>";
        html += '<div class="stage-card-address">' + (a.address ? esc(a.address) : '<span class="meta">물건지 미입력</span>') + "</div>";
        html += '<div class="stage-card-price">' + (a.price ? won(a.price) : '<span class="meta" style="font-weight:400">금액 미입력</span>') + "</div>";
        if (a.memo) html += '<div class="stage-card-memo">' + esc(a.memo) + "</div>";
        html += '<div class="stage-card-updated">업데이트 ' + (a.updatedAt ? formatShortDate(a.updatedAt.slice(0, 10)) : "-") + "</div>";
        html += "</div>";
      });
      html += "</div>";
    }

    var detailTarget = auctionDetailId && state.auctions.find(function (a) { return a.id === auctionDetailId; });
    if (detailTarget) html += auctionDetailModalHtml(detailTarget);

    return html;
  }

  function auctionDetailModalHtml(a) {
    var html = '<div class="card-detail-overlay" id="auctionDetailOverlay"><div class="card-detail-box">';
    html += '<button type="button" class="card-detail-close" id="auctionDetailCloseBtn" aria-label="닫기">✕</button>';
    html += "<h2>" + esc(a.client || "(이름 없음)") + "</h2>";
    html += '<div class="card-detail-fields">';
    html += field("고객명", '<input type="text" class="inline-select" data-inline-text="client" data-id="' + a.id + '" data-entity="auction" value="' + esc(a.client || "") + '" placeholder="고객명">');
    html += field("구분", selectHtml("kind", ["경매", "컨설팅"], a.kind, a.id, "auction"));
    html += field("진행단계", selectHtml("stage", AUCTION_STAGES, a.stage, a.id, "auction"));
    html += field("금액(원)", '<input type="number" class="inline-select" min="0" step="1000000" data-inline-number="price" data-id="' + a.id + '" data-entity="auction" value="' + (a.price || 0) + '">');
    html += field("업데이트", '<input type="date" class="inline-select" data-inline-date="updatedAt" data-id="' + a.id + '" data-entity="auction" value="' + esc((a.updatedAt || "").slice(0, 10)) + '">');
    html += field("물건지", '<input type="text" class="inline-select" data-inline-text="address" data-id="' + a.id + '" data-entity="auction" value="' + esc(a.address || "") + '" placeholder="예: 경기 광주시 ○○동">', "grow");
    html += field("메모", '<textarea class="inline-select" data-inline-text="memo" data-id="' + a.id + '" data-entity="auction" placeholder="진행 메모" style="min-height:80px">' + esc(a.memo || "") + "</textarea>", "grow");
    html += "</div>";
    html += '<div class="card-detail-footer"><button type="button" class="btn btn-danger-ghost btn-sm" data-del="auction" data-id="' + a.id + '">🗑 이 건 삭제</button></div>';
    html += "</div></div>";
    return html;
  }

  function bindAuctionsEvents() {
    document.getElementById("auctionForm").addEventListener("submit", function (e) {
      e.preventDefault();
      var fd = new FormData(e.target);
      var client = (fd.get("client") || "").toString().trim();
      if (!client) return;
      state.auctions.push({
        id: uid(), client: client, kind: fd.get("kind"), address: (fd.get("address") || "").toString(),
        stage: fd.get("stage"), price: Number(fd.get("price")) || 0, memo: (fd.get("memo") || "").toString(),
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
      });
      saveState(); toast("경매·컨설팅 건이 추가되었습니다."); render();
    });

    Array.prototype.forEach.call(document.querySelectorAll("[data-stage-filter]"), function (btn) {
      btn.addEventListener("click", function () { auctionFilterStage = btn.getAttribute("data-stage-filter"); render(); });
    });

    Array.prototype.forEach.call(document.querySelectorAll("[data-auction-card]"), function (card) {
      var openDetail = function () { auctionDetailId = card.getAttribute("data-auction-card"); render(); };
      // 카드 안의 버튼(삭제·결과입력·권리분석)은 상세보기로 이어지지 않게 한다.
      // 키보드로 버튼에 포커스한 뒤 Enter 를 눌러도 마찬가지다 — keydown 이 카드까지 올라온다.
      card.addEventListener("click", function (e) {
        if (e.target.closest("button")) return;
        openDetail();
      });
      card.addEventListener("keydown", function (e) {
        if (e.target !== card) return;
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openDetail(); }
      });
    });
    var auctionDetailOverlay = document.getElementById("auctionDetailOverlay");
    if (auctionDetailOverlay) {
      document.getElementById("auctionDetailCloseBtn").addEventListener("click", function () { auctionDetailId = null; render(); });
      auctionDetailOverlay.addEventListener("click", function (e) {
        if (e.target === auctionDetailOverlay) { auctionDetailId = null; render(); }
      });
    }

    bindTableCommon("auction");
  }

  function loansSectionHtml() {
    var filtered = loanFilterStage === "all" ? state.loans : state.loans.filter(function (l) { return l.stage === loanFilterStage; });

    var html = "";
    html += '<div class="sub" style="margin:-4px 0 12px">경매 · 일반 부동산 대출 상담 및 진행 단계 관리</div>';

    html += '<form class="add-form" id="loanForm">';
    html += field("고객명", '<input type="text" name="client" placeholder="예: 박고객" required>');
    html += field("물건", '<input type="text" name="property" placeholder="관련 물건">', "grow");
    html += field("구분", selectHtml("loanType", ["개인", "법인"], "개인"));
    html += field("은행/담당", '<input type="text" name="bank" placeholder="예: ○○은행 △△지점">');
    html += field("진행단계", selectHtml("stage", LOAN_STAGES, LOAN_STAGES[0]));
    html += field("대출한도(원)", '<input type="number" name="limitAmount" min="0" step="1000000">');
    html += field("메모", '<input type="text" name="memo" placeholder="진행 메모">', "grow");
    html += '<button type="submit" class="btn btn-primary">+ 상담 추가</button>';
    html += "</form>";

    html += '<div class="filter-bar">' + ["all"].concat(LOAN_STAGES).map(function (st) {
      var label = st === "all" ? "전체" : st;
      return '<button class="filter-chip" data-loan-stage-filter="' + st + '" aria-pressed="' + (loanFilterStage === st) + '">' + esc(label) + "</button>";
    }).join("") + "</div>";

    html += '<div class="table-wrap"><table class="data-table"><thead><tr><th>고객명</th><th>물건</th><th>구분</th><th>은행/담당</th><th>단계</th><th>대출한도</th><th>메모</th><th>업데이트</th><th></th></tr></thead><tbody>';
    if (filtered.length === 0) {
      html += '<tr><td colspan="9"><div class="empty-state">해당하는 대출상담 건이 없습니다.</div></td></tr>';
    } else {
      filtered.slice().sort(function (a, b) { return (b.updatedAt || "").localeCompare(a.updatedAt || ""); }).forEach(function (l) {
        html += "<tr>";
        html += "<td>" + esc(l.client) + "</td>";
        html += "<td>" + esc(l.property || "-") + "</td>";
        html += "<td>" + pill(l.loanType, l.loanType === "법인" ? "brand" : "neutral") + "</td>";
        html += "<td>" + esc(l.bank || "-") + "</td>";
        html += "<td>" + selectHtml("stage", LOAN_STAGES, l.stage, l.id, "loan") + "</td>";
        html += '<td class="num">' + won(l.limitAmount) + "</td>";
        html += '<td class="memo-cell">' + esc(l.memo || "-") + "</td>";
        html += "<td>" + formatShortDate((l.updatedAt || "").slice(0, 10)) + "</td>";
        html += '<td><div class="row-actions"><button class="icon-btn" data-del="loan" data-id="' + l.id + '" aria-label="삭제">✕</button></div></td>';
        html += "</tr>";
      });
    }
    html += "</tbody></table></div>";
    return html;
  }

  function bindLoansEvents() {
    document.getElementById("loanForm").addEventListener("submit", function (e) {
      e.preventDefault();
      var fd = new FormData(e.target);
      var client = (fd.get("client") || "").toString().trim();
      if (!client) return;
      state.loans.push({
        id: uid(), client: client, property: (fd.get("property") || "").toString(), loanType: fd.get("loanType"),
        bank: (fd.get("bank") || "").toString(), stage: fd.get("stage"), limitAmount: Number(fd.get("limitAmount")) || 0,
        memo: (fd.get("memo") || "").toString(), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
      });
      saveState(); toast("대출상담 건이 추가되었습니다."); render();
    });

    Array.prototype.forEach.call(document.querySelectorAll("[data-loan-stage-filter]"), function (btn) {
      btn.addEventListener("click", function () { loanFilterStage = btn.getAttribute("data-loan-stage-filter"); render(); });
    });

    bindTableCommon("loan");
  }

  function renderCaselaw() {
    var html = "";
    html += '<div class="page-head"><div><h1>대법원판례</h1><div class="sub">부동산 경매 관련 대법원 판례·법령정보·참고자료를 모아둡니다</div></div></div>';

    html += '<form class="add-form" id="resourceForm">';
    html += field("제목", '<input type="text" name="title" placeholder="예: 대법원 2013다27831 판결 - ...">', "grow");
    html += field("카테고리", selectHtml("category", RESOURCE_CATEGORY, RESOURCE_CATEGORY[0]));
    html += field("링크", '<input type="text" name="url" placeholder="https://...">', "grow");
    html += field("메모", '<input type="text" name="memo" placeholder="판시 요지·참고사항">', "grow");
    html += '<button type="submit" class="btn btn-primary">+ 자료 등록</button>';
    html += "</form>";

    html += '<div class="filter-bar">';
    html += '<button class="filter-chip" data-res-filter="all" aria-pressed="' + (resourceFilterCategory === "all") + '">전체</button>';
    RESOURCE_CATEGORY.forEach(function (c) {
      html += '<button class="filter-chip" data-res-filter="' + c + '" aria-pressed="' + (resourceFilterCategory === c) + '">' + c + "</button>";
    });
    html += "</div>";

    var filtered = state.resources.filter(function (r) { return resourceFilterCategory === "all" || r.category === resourceFilterCategory; })
      .slice().sort(function (a, b) { return b.createdAt.localeCompare(a.createdAt); });

    if (filtered.length === 0) {
      html += '<div class="empty-state">등록된 자료가 없습니다.</div>';
    } else {
      html += '<div class="table-wrap"><table class="data-table"><thead><tr><th>제목</th><th>카테고리</th><th>링크</th><th>메모</th><th></th></tr></thead><tbody>';
      filtered.forEach(function (r) {
        html += "<tr>";
        html += "<td>" + esc(r.title) + "</td>";
        html += "<td>" + pill(r.category, "brand") + "</td>";
        html += "<td>" + (r.url ? '<a href="' + esc(r.url) + '" target="_blank" rel="noopener">🔗 열기</a>' : "-") + "</td>";
        html += '<td class="memo-cell">' + esc(r.memo || "") + "</td>";
        html += '<td><button class="icon-btn" data-del="resource" data-id="' + r.id + '" aria-label="삭제">✕</button></td>';
        html += "</tr>";
      });
      html += "</tbody></table></div>";
    }

    document.getElementById("main").innerHTML = html;

    document.getElementById("resourceForm").addEventListener("submit", function (e) {
      e.preventDefault();
      var fd = new FormData(e.target);
      var title = (fd.get("title") || "").toString().trim();
      if (!title) return;
      state.resources.push({
        id: uid(), title: title, category: fd.get("category"), url: (fd.get("url") || "").toString(),
        memo: (fd.get("memo") || "").toString(), createdAt: new Date().toISOString()
      });
      saveState(); toast("자료가 등록되었습니다."); render();
    });

    Array.prototype.forEach.call(document.querySelectorAll("[data-res-filter]"), function (btn) {
      btn.addEventListener("click", function () { resourceFilterCategory = btn.getAttribute("data-res-filter"); render(); });
    });

    bindTableCommon("resource");
  }

  function renderAuctionsLoans() {
    var html = "";
    html += '<div class="page-head"><div><h1>경매·컨설팅·대출상담</h1><div class="sub">경매·컨설팅 진행현황과 대출상담 진행현황을 한 화면에서 관리합니다</div></div></div>';

    html += '<div class="filter-bar">';
    html += '<button class="filter-chip" data-auctionsloans-tab="auction" aria-pressed="' + (auctionsLoansTab === "auction") + '">🏠 경매·컨설팅 (' + state.auctions.length + '건)</button>';
    html += '<button class="filter-chip" data-auctionsloans-tab="loan" aria-pressed="' + (auctionsLoansTab === "loan") + '">🏦 대출상담 (' + state.loans.length + '건)</button>';
    html += "</div>";

    html += auctionsLoansTab === "loan" ? loansSectionHtml() : auctionsSectionHtml();

    document.getElementById("main").innerHTML = html;

    Array.prototype.forEach.call(document.querySelectorAll("[data-auctionsloans-tab]"), function (btn) {
      btn.addEventListener("click", function () { auctionsLoansTab = btn.getAttribute("data-auctionsloans-tab"); render(); });
    });

    if (auctionsLoansTab === "loan") bindLoansEvents(); else bindAuctionsEvents();
  }

  /* ---------------- Market Auction Analysis ---------------- */
  function marketDiscountPct(m) {
    if (!m.appraisalValue || m.appraisalValue <= 0 || !m.minSalePrice) return null;
    return (1 - (m.minSalePrice / m.appraisalValue)) * 100;
  }

  function sortMarketAuctions(list, sortKey) {
    var sorted = list.slice();
    switch (sortKey) {
      case "saleDate_asc":
        // 매각기일이 없는 물건은 뒤로 보낸다
        sorted.sort(function (a, b) {
          if (!a.saleDate && !b.saleDate) return 0;
          if (!a.saleDate) return 1;
          if (!b.saleDate) return -1;
          return a.saleDate.localeCompare(b.saleDate);
        });
        break;
      case "saleDate_desc":
        sorted.sort(function (a, b) {
          if (!a.saleDate && !b.saleDate) return 0;
          if (!a.saleDate) return 1;
          if (!b.saleDate) return -1;
          return b.saleDate.localeCompare(a.saleDate);
        });
        break;
      case "discount_desc":
        sorted.sort(function (a, b) { return (marketDiscountPct(b) || -Infinity) - (marketDiscountPct(a) || -Infinity); });
        break;
      case "failCount_desc":
        sorted.sort(function (a, b) { return (b.failCount || 0) - (a.failCount || 0); });
        break;
      case "date_desc":
      default:
        sorted.sort(function (a, b) { return (b.date || "").localeCompare(a.date || ""); });
        break;
    }
    return sorted;
  }

  function marketRegionOptions() {
    var set = {};
    state.marketAuctions.forEach(function (m) { if (m.region) set[m.region] = true; });
    return Object.keys(set).sort();
  }

  var MARKET_DISTRICT_PILL_KINDS = ["brand", "accent", "good", "warn", "danger", "neutral"];
  function marketDistrictLabel(region) {
    if (!region) return null;
    var parts = region.trim().split(/\s+/);
    var last = parts[parts.length - 1];
    return /(구|군|시)$/.test(last) ? last : region.trim();
  }
  function marketDistrictPillKind(label) {
    var hash = 0;
    for (var i = 0; i < label.length; i++) hash = (hash * 31 + label.charCodeAt(i)) >>> 0;
    return MARKET_DISTRICT_PILL_KINDS[hash % MARKET_DISTRICT_PILL_KINDS.length];
  }

  function computeMarketStats() {
    var today = todayStr();
    var mk = monthKey();
    var todayCount = 0, monthCount = 0, activeCount = 0, analysisMissingCount = 0;
    var monthRateSum = 0, monthRateN = 0;
    state.marketAuctions.forEach(function (m) {
      if (m.date === today) todayCount++;
      if ((m.date || "").slice(0, 7) === mk) {
        monthCount++;
        if (m.status === "낙찰" && m.appraisalValue > 0 && m.winningBid > 0) {
          monthRateSum += (m.winningBid / m.appraisalValue) * 100;
          monthRateN++;
        }
      }
      if (MARKET_ACTIVE_STATUS[m.status]) activeCount++;
      if (!m.analysisWritten) analysisMissingCount++;
    });
    return {
      todayCount: todayCount, monthCount: monthCount, activeCount: activeCount,
      monthAvgRate: monthRateN ? (monthRateSum / monthRateN) : null,
      analysisMissingCount: analysisMissingCount
    };
  }

  function regionRateDistributionHtml() {
    var regions = marketRegionOptions();
    if (!regions.length) return '<div class="empty-state">등록된 지역 데이터가 없습니다.</div>';
    var rows = regions.map(function (r) {
      var items = state.marketAuctions.filter(function (m) { return m.region === r && m.status === "낙찰" && m.appraisalValue > 0 && m.winningBid > 0; });
      if (!items.length) return null;
      var avg = items.reduce(function (sum, m) { return sum + (m.winningBid / m.appraisalValue) * 100; }, 0) / items.length;
      return { region: r, avg: avg };
    }).filter(Boolean);
    if (!rows.length) return '<div class="empty-state">낙찰가율을 계산할 낙찰 건이 아직 없습니다.</div>';
    var max = Math.max.apply(null, rows.map(function (r) { return r.avg; }).concat([1]));
    return rows.sort(function (a, b) { return b.avg - a.avg; }).map(function (r) {
      var pct = Math.round((r.avg / max) * 100);
      return '<div class="stage-row"><div class="name">' + esc(r.region) + '</div><div class="bar-track"><div class="bar-fill" style="width:' + pct + '%"></div></div><div class="n">' + r.avg.toFixed(1) + "%</div></div>";
    }).join("");
  }

  // 매각기일이 지났는데 결과(유찰/낙찰/패찰/변경/취하)가 아직 안 적힌 물건. 홈 긴급 목록과 카드 경고에 쓴다.
  function marketResultOverdueList() {
    var today = todayStr();
    return state.marketAuctions.filter(function (m) {
      return m.saleDate && m.saleDate < today && (m.status === "조사중" || m.status === "입찰예정");
    });
  }
  /* ── 대표 지시창 · 실시간 피드 · 직원 출근판 ────────────────────────
     지시는 Drive 에 ahj_ceo_order_*.json 으로 올라가고, 다음 아침 루틴이
     읽어서 처리한 뒤 ahj_patch_chunk_ 로 ceoOrders 에 답을 적어 준다. */
  var DRIVE_CEO_ORDER_PREFIX = "ahj_ceo_order_";
  var CEO_QUICK_ORDERS = [
    "오늘 뭐 했는지 정리해줘",
    "왜 늦어지는지 알려줘",
    "발행대기 글 순서 정해줘",
    "이번 주 KPI 뽑아줘"
  ];
  var ORDER_PILL = { "접수": "warn", "처리중": "brand", "완료": "good", "보류": "neutral" };

  /* ── 즉답 엔진 ─────────────────────────────────────────────────
     지시창이 "내일 아침 처리함"이기만 하니, 대시보드가 이미 알고 있는
     것까지 하루를 기다려야 했다. 오늘 뭐 했는지·왜 늦는지·KPI 같은 건
     전부 화면의 state 안에 답이 있다. 그런 건 보내는 즉시 여기서 답하고,
     밖에 나가 봐야 아는 것(글 써줘·조사해줘)만 아침 루틴으로 넘긴다. */
  function ceoAnswerToday() {
    var today = todayStr();
    var lines = [];
    var evs = aiWorkLogEvents().filter(function (e) { return (e.at || "").slice(0, 10) === today; });
    var runs = (state.routineRuns || []).filter(function (r) { return (r.at || "").slice(0, 10) === today; });
    if (runs.length) {
      var okN = runs.filter(function (r) { return r.status === "ok"; }).length;
      var holdN = runs.filter(function (r) { return r.status === "hold"; }).length;
      var failN = runs.filter(function (r) { return r.status === "fail"; }).length;
      lines.push("AI 직원 루틴 " + runs.length + "건 실행 (정상 " + okN +
        (holdN ? " · 보류 " + holdN : "") + (failN ? " · 오류 " + failN : "") + ")");
      runs.slice(0, 5).forEach(function (r) {
        var job = ROUTINE_JOBS.find(function (j) { return j.key === r.job; });
        lines.push("· " + (job ? job.name : r.job) + " — " + (r.summary || r.status));
      });
    }
    var newPosts = state.blogPosts.filter(function (p) { return (p.createdAt || p.date || "").slice(0, 10) === today; });
    var pubToday = state.blogPosts.filter(function (p) { return (p.publishedAt || "").slice(0, 10) === today; });
    if (newPosts.length || pubToday.length) {
      lines.push("블로그 — 새 글 " + newPosts.length + "건 · 발행 " + pubToday.length + "건");
    }
    var mkt = state.marketAuctions.filter(function (m) { return (m.updatedAt || "").slice(0, 10) === today; });
    if (mkt.length) {
      lines.push("경매 물건 " + mkt.length + "건 갱신 — " +
        mkt.slice(0, 4).map(function (m) { return m.caseNumber + " " + (m.status || ""); }).join(", "));
    }
    var tx = state.transactions.filter(function (t) { return t.date === today; });
    if (tx.length) {
      var dep = tx.reduce(function (a, t) { return a + (Number(t.deposit) || 0); }, 0);
      var wd = tx.reduce(function (a, t) { return a + (Number(t.withdrawal) || 0); }, 0);
      lines.push("은행 " + tx.length + "건 — 입금 " + won(dep) + " · 출금 " + won(wd));
    }
    var db = state.studentDb.filter(function (d) { return (d.registeredDate || "") === today; });
    if (db.length) lines.push("수강생 DB 신규 " + db.length + "명");
    var wr = (state.workReports || []).filter(function (w) { return (w.date || "") === today; });
    if (wr.length) lines.push("업무일지 " + wr.length + "건 수집됨");
    if (!lines.length) {
      return "오늘(" + today + ") 기록된 움직임이 아직 없습니다. 루틴은 07시·08시·15:48·20시에 돌고, 결과가 여기 쌓입니다.";
    }
    return "오늘(" + today + ") 한 일\n" + lines.join("\n") +
      (evs.length ? "\n(직원 활동 기록 " + evs.length + "건)" : "");
  }

  function ceoAnswerStuck() {
    var evs = aiWorkLogEvents();
    var bad = ROUTINE_JOBS.map(function (j) { return { job: j, st: routineStatus(j, evs) }; })
      .filter(function (x) { return x.st.kind === "late" || x.st.kind === "fail" || x.st.kind === "hold" || x.st.kind === "blocked"; });
    var out = [];
    bad.forEach(function (x) {
      var why = (x.st.last && x.st.last.summary) || x.st.label;
      // 주간·수시 업무는 시각(at)이 없다. 그대로 찍으면 "이름 ()" 이 된다.
      var when = x.job.at || (x.job.cycle === "weekly" ? "매주" : "수시");
      out.push("· " + x.job.name + " (" + when + ") — " + x.st.label + (why && why !== x.st.label ? " — " + why : ""));
    });
    var over = marketResultOverdueList();
    if (over.length) {
      out.push("· 경매 결과 미입력 " + over.length + "건 — " +
        over.slice(0, 4).map(function (m) { return m.caseNumber; }).join(", "));
    }
    var pend = state.blogPosts.filter(function (p) { return p.status === "발행대기"; }).length;
    if (pend >= 20) out.push("· 발행대기 " + pend + "건 적체 — 20건 넘으면 새 글 생산이 멈춥니다. 네이버에 올리고 '발행 완료'를 눌러주세요.");
    if (!out.length) return "지금 막힌 것 없습니다. 루틴 전부 정상입니다.";
    return "막혀 있는 것\n" + out.join("\n");
  }

  function ceoAnswerBlogQueue() {
    var pend = state.blogPosts.filter(function (p) { return p.status === "발행대기"; });
    if (!pend.length) return "발행대기 글이 없습니다.";
    // 오래 묵은 것부터 올리는 게 적체를 푸는 가장 빠른 길이다.
    pend.sort(function (a, b) {
      return ((a.createdAt || a.date || "") < (b.createdAt || b.date || "")) ? -1 : 1;
    });
    var lines = pend.slice(0, 10).map(function (p, i) {
      return (i + 1) + ". " + (p.date || (p.createdAt || "").slice(0, 10)) + " " + (p.title || "").slice(0, 40);
    });
    return "발행대기 " + pend.length + "건 — 오래된 순서\n" + lines.join("\n") +
      (pend.length > 10 ? "\n… 외 " + (pend.length - 10) + "건" : "");
  }

  function ceoAnswerKpi() {
    var wk = weekRange();
    var v = computeKpiValues(wk.start, wk.end);
    var t = weeklyKpiTargets();
    var lines = WEEKLY_KPI_ROWS.map(function (r) {
      var raw = v[r.key];
      var val = (raw && typeof raw === "object") ? raw.value : (Number(raw) || 0);
      var goal = (t[r.key] || [])[0];
      return "· " + r.label + " " + kpiFmt(val, r.unit) +
        (goal ? " / 목표 " + kpiFmt(goal, r.unit) : "");
    });
    return "이번 주 KPI (" + wk.start + " ~ " + wk.end + ")\n" + lines.join("\n");
  }

  // 지시 글을 보고 즉답할 수 있는 것인지 고른다. 못 고르면 null 을 돌려
  // 기존대로 Drive 에 올려 아침 루틴에 넘긴다.
  function ceoInstantAnswer(text) {
    var q = (text || "").replace(/\s+/g, "");
    if (/오늘.*(뭐|한일|한거|정리|요약|했)/.test(q) || /(금일|투데이).*(정리|요약)/.test(q)) return ceoAnswerToday();
    if (/(왜|어디).*(늦|막히|멈|안되|안돼)/.test(q) || /(지연|멈춤|막힌)/.test(q)) return ceoAnswerStuck();
    if (/발행대기|발행.*순서|올릴글|글순서/.test(q)) return ceoAnswerBlogQueue();
    if (/kpi|KPI|케이피아이|이번주실적|주간실적/.test(q)) return ceoAnswerKpi();
    return null;
  }

  function ceoOrdersSorted() {
    return (state.ceoOrders || []).slice().sort(function (a, b) { return (b.at || "").localeCompare(a.at || ""); });
  }

  function sendCeoOrder(text) {
    text = (text || "").trim();
    if (!text) { toast("지시 내용을 적어주세요."); return; }
    // 즉답은 Drive 가 없어도 된다. 밖에 나가야 하는 지시만 mcp 를 필요로 한다.
    if ((!window.claude || !window.claude.mcp) && !ceoInstantAnswer(text)) {
      toast("이 화면에서는 지시를 보낼 수 없습니다."); return;
    }
    var now = new Date().toISOString();
    var instant = ceoInstantAnswer(text);
    if (instant) {
      // 대시보드가 이미 아는 것이다. 하루 기다릴 이유가 없으니 바로 답한다.
      state.ceoOrders = state.ceoOrders || [];
      state.ceoOrders.push({ id: "ord" + Date.now(), at: now, text: text, status: "완료",
        reply: instant, repliedAt: now, answeredBy: "dashboard" });
      saveState();
      ceoOrderDraft = "";
      render();
      toast("✅ 바로 답했습니다.");
      return;
    }
    var order = { id: "ord" + Date.now(), at: now, text: text, status: "접수", reply: "", repliedAt: "" };
    state.ceoOrders = state.ceoOrders || [];
    state.ceoOrders.push(order);
    saveState();
    ceoOrderDraft = "";
    render();
    var payload = {
      title: DRIVE_CEO_ORDER_PREFIX + order.id + ".json",
      textContent: JSON.stringify({ id: order.id, at: now, text: text }),
      contentMimeType: "application/json",
      disableConversionToGoogleType: true
    };
    resolveDriveFolder().then(function (folderId) {
      if (folderId) payload.parentId = folderId;
      return window.claude.mcp.callTool(DRIVE_SERVER, "create_file", payload);
    }).then(function () {
      toast("📮 지시를 보냈습니다. 다음 아침 점검(07시) 때 처리됩니다.");
    }).catch(function () {
      var o = (state.ceoOrders || []).find(function (x) { return x.id === order.id; });
      if (o) { o.status = "보류"; o.reply = "전송 실패 — 다시 보내주세요."; saveState(); render(); }
      toast("지시 전송에 실패했습니다. 다시 시도해주세요.");
    });
  }

  function ceoConsoleHtml() {
    var orders = ceoOrdersSorted();
    var pending = orders.filter(function (o) { return o.status === "접수" || o.status === "처리중"; }).length;
    var html = '<div class="win office-win"><div class="win-bar"><span>🖋 ceo.console — 대표 지시창</span>' +
      (pending ? '<b class="win-badge">' + pending + "</b>" : "") + "</div>";
    html += '<div class="win-body">';
    html += '<div class="cc-quick">' + CEO_QUICK_ORDERS.map(function (q) {
      return '<button type="button" class="cc-chip" data-ceo-quick="' + esc(q) + '">' + esc(q) + "</button>";
    }).join("") + "</div>";
    html += '<textarea id="ceoOrderInput" class="cc-input" rows="2" placeholder="예: 대구 물건 위주로 글 써줘 / 브랜드전략 이번 주 꼭 돌려줘">' + esc(ceoOrderDraft) + "</textarea>";
    html += '<button type="button" class="btn btn-primary btn-sm cc-send" id="ceoOrderSend">지시 보내기</button>';
    html += '<div class="cc-hint">오늘 한 일 · 막힌 것 · 발행대기 순서 · 이번 주 KPI 는 <b>바로 답합니다</b>. 그 밖의 지시(글 작성·조사 등)는 다음 아침 점검(07시)에 처리됩니다.</div>';
    if (!orders.length) {
      html += '<div class="cc-empty">아직 보낸 지시가 없습니다.</div>';
    } else {
      html += '<div class="cc-list">' + orders.slice(0, 6).map(function (o) {
        var h = '<div class="cc-item"><div class="cc-item-top">' + pill(o.status, ORDER_PILL[o.status] || "neutral") +
          '<span class="meta">' + esc(timeAgo(o.at)) + "</span></div>";
        h += '<div class="cc-text">' + esc(o.text) + "</div>";
        if (o.reply) {
          h += '<div class="cc-reply' + (o.answeredBy === "dashboard" ? " cc-reply-now" : "") + '"><b>' +
            (o.answeredBy === "dashboard" ? "즉답" : "답") + "</b> " + esc(o.reply) + "</div>";
        }
        return h + "</div>";
      }).join("") + "</div>";
    }
    html += "</div></div>";
    return html;
  }

  function liveFeedHtml(events) {
    var shown = (events || []).slice(0, 8);
    var html = '<div class="win office-win"><div class="win-bar"><span>📡 live.feed — 실시간 업무</span></div><div class="win-body">';
    if (!shown.length) {
      html += '<div class="cc-empty">아직 기록이 없습니다.</div>';
    } else {
      html += '<div class="lf-list">' + shown.map(function (e) {
        var m = AI_WORK_ROSTER.find(function (x) { return x.id === e.who; });
        return '<div class="lf-row"><span class="lf-time">' + fmtClock(e.at) + '</span>' +
          '<span class="lf-ico">' + (m ? m.icon : "🤖") + "</span>" +
          '<span class="lf-txt"><b>' + esc(m ? m.name.replace(" 담당", "") : "운영 비서") + "</b> " +
          esc(lastStageLabel(e)) + (e.title ? " · " + esc(e.title.slice(0, 34)) : "") + "</span></div>";
      }).join("") + "</div>";
    }
    html += "</div></div>";
    return html;
  }

  function staffRosterHtml(events) {
    var today = todayStr();
    var html = '<div class="win office-win"><div class="win-bar"><span>👥 staff.roster — 직원 출근판</span></div><div class="win-body">';
    html += '<div class="sr-list">';
    AI_WORK_ROSTER.forEach(function (m) {
      var mine = (events || []).filter(function (e) { return e.who === m.id; });
      var last = mine[0];
      var mins = last ? (Date.now() - new Date(last.at).getTime()) / 60000 : Infinity;
      var todayN = mine.filter(function (e) { return e.at.slice(0, 10) === today; }).length;
      var kind = mins < 20 ? "live" : todayN ? "done" : "idle";
      var label = mins < 20 ? "근무 중" : todayN ? "오늘 완료" : "대기";
      html += '<button type="button" class="sr-item ' + kind + '" data-agent-open="' + m.id + '">' +
        '<span class="sr-dot"></span><span class="sr-name">' + esc(m.name.replace(" 담당", "")) + "</span>" +
        '<span class="sr-state">' + esc(label) + "</span></button>";
    });
    html += "</div></div></div>";
    return html;
  }

  function officeWindowsHtml(events, layout) {
    // layout "col" = 사무실 지도 오른쪽에 세로로 세우는 배치. 그 외에는 가로로 3칸.
    var cls = "office-wins" + (layout === "col" ? " office-wins-col" : " section-gap");
    return '<div class="' + cls + '">' + ceoConsoleHtml() + liveFeedHtml(events) + staffRosterHtml(events) + "</div>";
  }

  function mstat(label, value, unit, tone, filterKey) {
    var on = filterKey && marketFilterAnalysis === filterKey;
    var attr = filterKey ? ' data-mstat-filter="' + filterKey + '" role="button" tabindex="0" aria-pressed="' + on + '"' : "";
    return '<div class="mstat' + (tone ? " " + tone : "") + (filterKey ? " clickable" : "") + (on ? " on" : "") + '"' + attr + '>' +
      '<span class="mstat-k">' + esc(label) + "</span>" +
      '<span class="mstat-v">' + value + (unit ? '<i>' + esc(unit) + "</i>" : "") + "</span></div>";
  }
  function renderMarketAuction() {
    var stats = computeMarketStats();
    var regions = marketRegionOptions();

    var searchQuery = marketSearchQuery.trim().toLowerCase();
    var marketStatusFilterActive = Object.keys(marketFilterStatuses).length > 0;
    var filtered = state.marketAuctions.filter(function (m) {
      if (marketStatusFilterActive && !marketFilterStatuses[m.status]) return false;
      if (marketFilterRegion !== "all" && m.region !== marketFilterRegion) return false;
      if (marketFilterType !== "all" && m.propertyType !== marketFilterType) return false;
      if (marketFilterAnalysis === "written" && !m.analysisWritten) return false;
      if (marketFilterAnalysis === "missing" && m.analysisWritten) return false;
      if (searchQuery) {
        var haystack = [m.buildingName, m.caseNumber, m.court, m.region, m.propertyType, m.address, m.memo].join(" ").toLowerCase();
        if (haystack.indexOf(searchQuery) === -1) return false;
      }
      return true;
    });

    var html = "";
    html += '<div class="page-head"><div><h1>데일리 경매분석</h1><div class="sub">법원경매정보 사이트에서 직접 조사한 물건을 정리하고 흐름을 분석합니다</div></div>' +
      '<button class="btn btn-danger-ghost btn-sm" id="resetMarketBtn">물건 전체 삭제</button></div>';

    html += '<div class="backup-note">📌 대법원경매정보(courtauction.go.kr)에 자동 연동 API가 없어, 사이트에서 직접 조사한 물건을 여기에 입력해서 정리하는 방식입니다.</div>';
    // v85: 현황판 자동 등록은 매각기일 2주 안 물건만 올린다. 기다리는 물건이 있으면 몇 건인지만 보여 준다.
    var waitingAdds = (state.meta.pendingMarketAdds || []);
    if (waitingAdds.length) {
      var soon = waitingAdds.slice().sort(function (a, b) { return String(a.saleDate || "9999").localeCompare(String(b.saleDate || "9999")); }).slice(0, 3)
        .map(function (m) { return esc((m.buildingName || m.caseNumber || "") + (m.saleDate ? " " + String(m.saleDate).slice(5).replace("-", "/") : " 기일미정")); }).join(", ");
      html += '<div class="backup-note">⏳ 현황판 자동 등록 대기 ' + waitingAdds.length + '건 — 매각기일이 2주 안으로 들어오면 자동으로 올라옵니다. (' + soon + (waitingAdds.length > 3 ? " 외" : "") + ')</div>';
    }

    html += '<div class="mstat-grid">';
    html += mstat("오늘 등록", stats.todayCount, "건");
    html += mstat("이번달 등록", stats.monthCount, "건");
    html += mstat("진행중", stats.activeCount, "건");
    html += mstat("이번달 평균 낙찰가율", stats.monthAvgRate !== null ? stats.monthAvgRate.toFixed(1) : "-", stats.monthAvgRate !== null ? "%" : "");
    // 미작성 타일은 누르면 그 필터가 걸리게 한다 — 숫자를 보고 바로 그 목록으로 가는 게 자연스럽다
    html += mstat("권리분석 미작성", stats.analysisMissingCount, "건", stats.analysisMissingCount > 0 ? "warn" : "", "missing");
    html += "</div>";

    html += '<div class="market-toolbar">';
    html += '<button type="button" class="btn btn-primary btn-sm" id="marketAddToggleBtn">' + (marketAddFormOpen ? "− 입력 닫기" : "+ 새 물건 추가") + "</button>";
    html += '<button type="button" class="btn btn-ghost btn-sm" id="marketStatsToggleBtn">' + (marketStatsOpen ? "− 분포 숨기기" : "📊 분포 보기") + "</button>";
    html += "</div>";
    if (marketAddFormOpen) {
    html += '<form class="add-form" id="marketForm">';
    html += field("조사일", '<input type="date" name="date" value="' + todayStr() + '" required>');
    html += field("아파트명", '<input type="text" name="buildingName" placeholder="예: 대구역센트럴자이">');
    html += field("사건번호", '<input type="text" name="caseNumber" placeholder="예: 2026타경1234">');
    html += field("법원", '<input type="text" name="court" placeholder="예: 대구지방법원">');
    html += field("지역", '<input type="text" name="region" placeholder="예: 대구 달서구">');
    html += field("물건종류", selectHtml("propertyType", MARKET_PROPERTY_TYPES, MARKET_PROPERTY_TYPES[0]));
    html += field("소재지", '<input type="text" name="address" placeholder="상세 주소">', "grow");
    html += field("감정가(원)", '<input type="number" name="appraisalValue" min="0" step="1000000">');
    html += field("최저매각가(원)", '<input type="number" name="minSalePrice" min="0" step="1000000">');
    html += field("매각기일", '<input type="date" name="saleDate">');
    html += field("유찰횟수", '<input type="number" name="failCount" min="0" step="1" value="0">', "narrow");
    html += field("상태", selectHtml("status", MARKET_STATUS, MARKET_STATUS[0]));
    html += field("낙찰가(원)", '<input type="number" name="winningBid" min="0" step="1000000">');
    html += field("메모", '<input type="text" name="memo" placeholder="권리분석 메모 등">', "grow");
    html += '<button type="submit" class="btn btn-primary">+ 물건 추가</button>';
    html += "</form>";
    }

    if (marketStatsOpen) {
      html += '<div class="grid-2 section-gap">';
      html += '<div class="card"><h3>상태별 분포<span class="count">' + state.marketAuctions.length + '건</span></h3>' + stageDistributionHtml(state.marketAuctions, MARKET_STATUS, "status") + "</div>";
      html += '<div class="card"><h3>지역별 평균 낙찰가율</h3>' + regionRateDistributionHtml() + "</div>";
      html += "</div>";
      html += '<div class="card section-gap"><h3>물건종류별 분포<span class="count">' + filtered.length + "건 표시중 / 전체 " + state.marketAuctions.length + '건</span></h3>' + stageDistributionHtml(state.marketAuctions, MARKET_PROPERTY_TYPES, "propertyType") + "</div>";
    }

    // ── 검색 + 접이식 필터 ──
    // 필터 줄이 네 개(검색·종류·상태·권리분석) 연달아 깔려 모바일에서 목록이 한참 아래로 밀렸다.
    // 검색만 남기고 나머지는 접는다. 걸린 조건은 접혀 있어도 요약 칩으로 보여준다.
    var activeChips = [];
    if (marketFilterType !== "all") activeChips.push({ k: "type", t: marketFilterType });
    if (marketFilterRegion !== "all") activeChips.push({ k: "region", t: marketFilterRegion });
    if (marketFilterAnalysis !== "all") activeChips.push({ k: "analysis", t: marketFilterAnalysis === "missing" ? "권리분석 미작성" : "권리분석 작성됨" });
    Object.keys(marketFilterStatuses).forEach(function (st) { activeChips.push({ k: "status", t: st, v: st }); });

    html += '<div class="market-filter section-gap">';
    html += '<div class="mf-top">';
    html += '<input type="text" id="marketSearchInput" class="mf-search" placeholder="🔍 아파트명·사건번호·주소·메모 검색" value="' + esc(marketSearchQuery) + '">';
    html += '<button type="button" class="mf-toggle' + (activeChips.length ? " on" : "") + '" id="marketFilterToggle" aria-expanded="' + marketFilterOpen + '">' +
      (marketFilterOpen ? "▴ 필터 닫기" : "▾ 필터") + (activeChips.length ? "<b>" + activeChips.length + "</b>" : "") + "</button>";
    html += "</div>";

    if (activeChips.length) {
      html += '<div class="mf-active">' + activeChips.map(function (c) {
        return '<button type="button" class="mf-pill" data-mf-clear="' + c.k + '"' + (c.v ? ' data-mf-val="' + esc(c.v) + '"' : "") + ">" + esc(c.t) + "<span>✕</span></button>";
      }).join("") + '<button type="button" class="mf-clear-all" id="marketFilterClearAll">전체 해제</button></div>';
    }

    if (marketFilterOpen) {
      html += '<div class="mf-body">';

      html += '<div class="mf-grp"><span class="mf-lab">정렬 · 지역</span><div class="mf-row">';
      html += '<select class="inline-select" id="marketSortSelect">' + MARKET_SORT_OPTIONS.map(function (o) {
        return '<option value="' + o.key + '"' + (marketSortKey === o.key ? " selected" : "") + ">정렬: " + o.label + "</option>";
      }).join("") + "</select>";
      if (regions.length) {
        html += '<select class="inline-select" id="marketRegionFilter"><option value="all"' + (marketFilterRegion === "all" ? " selected" : "") + ">전체 지역</option>" +
          regions.map(function (r) { return '<option value="' + esc(r) + '"' + (marketFilterRegion === r ? " selected" : "") + ">" + esc(r) + "</option>"; }).join("") + "</select>";
      }
      html += "</div></div>";

      html += '<div class="mf-grp"><span class="mf-lab">물건 종류</span><div class="mf-row wrap">' + ["all"].concat(MARKET_PROPERTY_TYPES).map(function (t) {
        var label = t === "all" ? "전체" : t;
        var n = t === "all" ? state.marketAuctions.length : state.marketAuctions.filter(function (m) { return m.propertyType === t; }).length;
        return '<button class="filter-chip" data-market-type-filter="' + esc(t) + '" aria-pressed="' + (marketFilterType === t) + '">' + esc(label) + " (" + n + ")</button>";
      }).join("") + "</div></div>";

      html += '<div class="mf-grp"><span class="mf-lab">진행 상태 <i>낙찰 건은 흐리게, 변경·취하는 더 흐리게 표시되고 맨 아래로 정렬됩니다</i></span><div class="mf-row wrap">' + MARKET_STATUS.map(function (st) {
        var checked = !!marketFilterStatuses[st];
        var n = state.marketAuctions.filter(function (m) { return m.status === st; }).length;
        return '<label class="status-check-chip' + (checked ? " is-checked" : "") + '"><input type="checkbox" data-market-status-check="' + st + '"' + (checked ? " checked" : "") + ">" + esc(st) + " (" + n + ")</label>";
      }).join("") + "</div></div>";

      html += '<div class="mf-grp"><span class="mf-lab">권리분석</span><div class="mf-row wrap">' + [
        { key: "all", label: "전체" },
        { key: "missing", label: "✍️ 미작성 (" + state.marketAuctions.filter(function (m) { return !m.analysisWritten; }).length + ")" },
        { key: "written", label: "✅ 작성됨 (" + state.marketAuctions.filter(function (m) { return m.analysisWritten; }).length + ")" }
      ].map(function (o) {
        return '<button class="filter-chip" data-market-analysis-filter="' + o.key + '" aria-pressed="' + (marketFilterAnalysis === o.key) + '">' + o.label + "</button>";
      }).join("") + "</div></div>";

      html += "</div>";
    }
    html += '<div class="mf-count">' + filtered.length + "건 표시중 <i>/ 전체 " + state.marketAuctions.length + "건</i></div>";
    html += "</div>";

    var sortedMarket = sortMarketAuctions(filtered, marketSortKey).slice().sort(function (a, b) {
      return (MARKET_STATUS_DIMMED[a.status] ? 1 : 0) - (MARKET_STATUS_DIMMED[b.status] ? 1 : 0);
    });
    if (sortedMarket.length === 0) {
      html += '<div class="empty-state">해당하는 경매 물건이 없습니다.</div>';
    } else {
      html += '<div class="stage-card-grid">';
      sortedMarket.forEach(function (m) {
        var discount = marketDiscountPct(m);
        var districtLabel = marketDistrictLabel(m.region);
        var titleMain = m.buildingName || m.caseNumber || "(아파트명 미입력)";
        var showCaseSub = m.buildingName && m.caseNumber;
        var dimClass = MARKET_STATUS_DIMMED_STRONG[m.status] ? " is-dimmed-strong" : (MARKET_STATUS_DIMMED[m.status] ? " is-dimmed" : "");
        dimClass += m.analysisWritten ? " analysis-done" : "";
        html += '<div class="stage-card' + dimClass + '" data-market-card="' + m.id + '" role="button" tabindex="0">';
        html += '<button type="button" class="icon-btn stage-card-del" data-del="market" data-id="' + m.id + '" aria-label="삭제">✕</button>';
        html += '<div class="stage-card-top"><div><div class="stage-card-name">' + esc(titleMain) + "</div>" +
          (showCaseSub ? '<div class="stage-card-case">' + esc(m.caseNumber) + "</div>" : "") + "</div></div>";
        html += '<div class="stage-card-pills">' +
          (districtLabel ? pill(districtLabel, marketDistrictPillKind(districtLabel)) : "") +
          pill(m.propertyType || "기타", MARKET_TYPE_PILL[m.propertyType] || "neutral") + pill(m.status || "-", MARKET_STATUS_PILL[m.status] || "neutral") +
          (m.failCount > 0 ? pill(m.failCount + "회 유찰", m.failCount >= 3 ? "danger" : "warn") : pill("신건", "neutral")) +
"</div>";
        html += '<div class="stage-card-address">' + ([m.region, m.address].filter(Boolean).join(" · ") || '<span class="meta">지역·소재지 미입력</span>') + "</div>";
        html += '<div class="stage-card-price">' + (m.minSalePrice ? won(m.minSalePrice) : '<span class="meta" style="font-weight:400">최저매각가 미입력</span>') +
          (discount !== null ? " " + pill(discount.toFixed(1) + "%", discount >= 50 ? "danger" : discount >= 30 ? "warn" : "neutral") : "") +
          (marketExclusiveArea(m) ? " " + pill("전용 " + marketExclusiveArea(m) + "㎡", marketExclusiveArea(m) > MARKET_AUTO_MAX_AREA ? "warn" : "neutral") : "") + "</div>";
        if (m.memo) html += '<div class="stage-card-memo">' + esc(m.memo) + "</div>";
        // 대리님은 "이 물건이 아직 진행 중인지 끝났는지" 를 카드에서 바로 보고 싶어 한다.
        // 07시 루틴이 법원경매정보를 매일 대조해 courtResult 에 '진행중 · …' 또는 결과를 적고, 언제 확인했는지 남긴다.
        html += '<div class="stage-card-updated">매각기일 ' + (m.saleDate ? formatShortDate(m.saleDate) : "-") +
          (m.courtResult ? ' · <b class="court-chk' + (/^진행중/.test(m.courtResult) ? " on" : "") + '">법원 확인' +
            (m.courtCheckedAt ? " " + formatShortDate(m.courtCheckedAt) : "") + ': ' + esc(m.courtResult) + "</b>" : "") + "</div>";
        html += '<div class="stage-card-actions">' + marketAnalysisBtnHtml(m, "sm") + "</div>";
        if (m.saleDate && m.saleDate < todayStr() && (m.status === "조사중" || m.status === "입찰예정")) {
          html += '<div class="market-result-row"><span>⚠ 매각기일 지남 · 결과 입력</span>' +
            ["유찰", "낙찰", "패찰", "변경", "취하"].map(function (st) { return '<button type="button" class="btn btn-ghost btn-sm" data-market-quick-status="' + m.id + '" data-status="' + st + '">' + st + "</button>"; }).join("") + "</div>";
        }
        html += "</div>";
      });
      html += "</div>";
    }

    var marketDetailTarget = marketDetailId && state.marketAuctions.find(function (m) { return m.id === marketDetailId; });
    if (marketDetailTarget) html += marketDetailModalHtml(marketDetailTarget);

    document.getElementById("main").innerHTML = html;

    var marketFormEl = document.getElementById("marketForm");
    if (marketFormEl) marketFormEl.addEventListener("submit", function (e) {
      e.preventDefault();
      var fd = new FormData(e.target);
      var caseNumber = (fd.get("caseNumber") || "").toString().trim();
      var region = (fd.get("region") || "").toString().trim();
      if (!caseNumber && !region) { toast("사건번호나 지역 중 하나는 입력해주세요."); return; }
      state.marketAuctions.push({
        id: uid(), date: fd.get("date") || todayStr(), buildingName: (fd.get("buildingName") || "").toString().trim(), caseNumber: caseNumber,
        court: (fd.get("court") || "").toString().trim(), region: region,
        propertyType: fd.get("propertyType"), address: (fd.get("address") || "").toString().trim(),
        appraisalValue: Number(fd.get("appraisalValue")) || 0, minSalePrice: Number(fd.get("minSalePrice")) || 0,
        saleDate: fd.get("saleDate") || "", failCount: Number(fd.get("failCount")) || 0,
        status: fd.get("status"), winningBid: Number(fd.get("winningBid")) || 0,
        memo: (fd.get("memo") || "").toString().trim(), updatedAt: new Date().toISOString()
      });
      saveState(); toast("경매 물건이 추가되었습니다."); render();
    });

    var resetMarketBtn = document.getElementById("resetMarketBtn");
    if (resetMarketBtn) resetMarketBtn.addEventListener("click", function () {
      customConfirm("등록된 경매 물건을 모두 삭제합니다. 계속할까요?", function () {
        state.marketAuctions = []; saveState(); toast("경매 물건이 모두 삭제되었습니다."); render();
      });
    });
    Array.prototype.forEach.call(document.querySelectorAll("[data-market-status-check]"), function (cb) {
      cb.addEventListener("change", function () {
        var st = cb.getAttribute("data-market-status-check");
        if (cb.checked) marketFilterStatuses[st] = true; else delete marketFilterStatuses[st];
        render();
      });
    });
    var marketAddToggleBtn = document.getElementById("marketAddToggleBtn");
    if (marketAddToggleBtn) marketAddToggleBtn.addEventListener("click", function () { marketAddFormOpen = !marketAddFormOpen; render(); });
    var marketStatsToggleBtn = document.getElementById("marketStatsToggleBtn");
    if (marketStatsToggleBtn) marketStatsToggleBtn.addEventListener("click", function () { marketStatsOpen = !marketStatsOpen; render(); });
    var marketFilterToggle = document.getElementById("marketFilterToggle");
    if (marketFilterToggle) marketFilterToggle.addEventListener("click", function () { marketFilterOpen = !marketFilterOpen; render(); });
    var marketFilterClearAll = document.getElementById("marketFilterClearAll");
    if (marketFilterClearAll) marketFilterClearAll.addEventListener("click", function () {
      marketFilterStatuses = {}; marketFilterRegion = "all"; marketFilterType = "all"; marketFilterAnalysis = "all"; render();
    });
    Array.prototype.forEach.call(document.querySelectorAll("[data-mf-clear]"), function (btn) {
      btn.addEventListener("click", function () {
        var k = btn.getAttribute("data-mf-clear");
        if (k === "type") marketFilterType = "all";
        else if (k === "region") marketFilterRegion = "all";
        else if (k === "analysis") marketFilterAnalysis = "all";
        else if (k === "status") delete marketFilterStatuses[btn.getAttribute("data-mf-val")];
        render();
      });
    });
    Array.prototype.forEach.call(document.querySelectorAll("[data-mstat-filter]"), function (el) {
      var apply = function () {
        var k = el.getAttribute("data-mstat-filter");
        marketFilterAnalysis = marketFilterAnalysis === k ? "all" : k;
        render();
      };
      el.addEventListener("click", apply);
      el.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); apply(); } });
    });
    Array.prototype.forEach.call(document.querySelectorAll("[data-market-type-filter]"), function (btn) {
      btn.addEventListener("click", function () { marketFilterType = btn.getAttribute("data-market-type-filter"); render(); });
    });
    Array.prototype.forEach.call(document.querySelectorAll("[data-market-analysis-filter]"), function (btn) {
      btn.addEventListener("click", function () { marketFilterAnalysis = btn.getAttribute("data-market-analysis-filter"); render(); });
    });
    Array.prototype.forEach.call(document.querySelectorAll("[data-market-quick-status]"), function (btn) {
      btn.addEventListener("click", function (e) {
        e.stopPropagation();
        var id = btn.getAttribute("data-market-quick-status"), st = btn.getAttribute("data-status");
        var item = state.marketAuctions.find(function (x) { return x.id === id; });
        if (!item) return;
        item.status = st;
        if (st === "유찰") item.failCount = (Number(item.failCount) || 0) + 1;
        item.updatedAt = new Date().toISOString();
        saveState();
        if (st === "낙찰") { marketDetailId = id; toast("낙찰로 표시했습니다. 낙찰가를 입력해주세요."); }
        else toast(st + "(으)로 표시했습니다.");
        render();
      });
    });
    Array.prototype.forEach.call(document.querySelectorAll("[data-market-analysis]"), function (btn) {
      btn.addEventListener("click", function (e) {
        e.stopPropagation();
        var item = state.marketAuctions.find(function (x) { return x.id === btn.getAttribute("data-market-analysis"); });
        if (!item) return;
        item.analysisWritten = !item.analysisWritten;
        item.updatedAt = new Date().toISOString();
        saveState();
        toast(item.analysisWritten ? "권리분석 작성됨으로 표시했습니다." : "권리분석 미작성으로 되돌렸습니다.");
        render();
      });
    });
    Array.prototype.forEach.call(document.querySelectorAll("[data-market-card]"), function (card) {
      var openDetail = function () { marketDetailId = card.getAttribute("data-market-card"); render(); };
      // 카드 안의 버튼(삭제·결과입력·권리분석)은 상세보기로 이어지지 않게 한다.
      // 키보드로 버튼에 포커스한 뒤 Enter 를 눌러도 마찬가지다 — keydown 이 카드까지 올라온다.
      card.addEventListener("click", function (e) {
        if (e.target.closest("button")) return;
        openDetail();
      });
      card.addEventListener("keydown", function (e) {
        if (e.target !== card) return;
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openDetail(); }
      });
    });
    var marketDetailOverlay = document.getElementById("marketDetailOverlay");
    if (marketDetailOverlay) {
      document.getElementById("marketDetailCloseBtn").addEventListener("click", function () { marketDetailId = null; render(); });
      marketDetailOverlay.addEventListener("click", function (e) {
        if (e.target === marketDetailOverlay) { marketDetailId = null; render(); }
      });
    }
    var marketFailBidBtn = document.querySelector("[data-market-fail-bid]");
    if (marketFailBidBtn) {
      marketFailBidBtn.addEventListener("click", function () {
        var id = marketFailBidBtn.getAttribute("data-market-fail-bid");
        var item = state.marketAuctions.find(function (x) { return x.id === id; });
        if (!item) return;
        var info = marketFailBidPreview(item);
        if (info.status !== "ok") { toast("자동 계산이 불가능한 상태입니다."); return; }
        item.minSalePrice = info.next;
        item.failCount = (item.failCount || 0) + 1;
        item.status = "유찰";
        item.updatedAt = new Date().toISOString();
        saveState();
        toast(info.matchedName + " 기준 " + info.rate + "% 저감 → 최저가 " + won(info.next) + "로 자동 갱신했습니다.");
        render();
      });
    }
    var regionFilterEl = document.getElementById("marketRegionFilter");
    if (regionFilterEl) {
      regionFilterEl.addEventListener("change", function () { marketFilterRegion = regionFilterEl.value; render(); });
    }
    var sortSelectEl = document.getElementById("marketSortSelect");
    if (sortSelectEl) {
      sortSelectEl.addEventListener("change", function () { marketSortKey = sortSelectEl.value; render(); });
    }
    var searchEl = document.getElementById("marketSearchInput");
    if (searchEl) {
      var marketSearchComposing = false;
      var marketSearchDebounceTimer = null;
      var runMarketSearch = function () {
        marketSearchQuery = searchEl.value;
        var cursorPos = searchEl.selectionStart;
        render();
        var newSearchEl = document.getElementById("marketSearchInput");
        if (newSearchEl) { newSearchEl.focus(); newSearchEl.setSelectionRange(cursorPos, cursorPos); }
      };
      var scheduleMarketSearch = function () {
        if (marketSearchDebounceTimer) clearTimeout(marketSearchDebounceTimer);
        marketSearchDebounceTimer = setTimeout(runMarketSearch, 250);
      };
      searchEl.addEventListener("compositionstart", function () {
        marketSearchComposing = true;
        if (marketSearchDebounceTimer) { clearTimeout(marketSearchDebounceTimer); marketSearchDebounceTimer = null; }
      });
      searchEl.addEventListener("compositionend", function () { marketSearchComposing = false; scheduleMarketSearch(); });
      searchEl.addEventListener("input", function (e) {
        if (marketSearchComposing || (e && e.isComposing)) return;
        scheduleMarketSearch();
      });
    }

    bindTableCommon("market");
  }

  // 권리분석 작성여부는 체크박스로 상세 모달을 열어야만 바꿀 수 있었다.
  // 카드에서 바로 누를 수 있는 토글 버튼으로 바꾼다.
  function marketAnalysisBtnHtml(m, size) {
    var on = !!m.analysisWritten;
    return '<button type="button" class="analysis-btn' + (on ? " on" : "") + (size === "sm" ? " sm" : "") +
      '" data-market-analysis="' + m.id + '" aria-pressed="' + on + '" title="' +
      (on ? "누르면 미작성으로 되돌립니다" : "권리분석 글을 다 썼으면 누르세요") + '">' +
      (on ? "✅ 권리분석 작성됨" : "✍️ 권리분석 작성완료로 표시") + "</button>";
  }
  function marketDetailModalHtml(m) {
    var html = '<div class="card-detail-overlay" id="marketDetailOverlay"><div class="card-detail-box">';
    html += '<button type="button" class="card-detail-close" id="marketDetailCloseBtn" aria-label="닫기">✕</button>';
    html += "<h2>" + esc(m.buildingName || m.caseNumber || "(아파트명 미입력)") + "</h2>";
    html += '<div class="card-detail-fields">';
    html += field("조사일", '<input type="date" class="inline-select" data-inline-date="date" data-id="' + m.id + '" data-entity="market" value="' + esc(m.date || "") + '">');
    html += field("아파트명", '<input type="text" class="inline-select" data-inline-text="buildingName" data-id="' + m.id + '" data-entity="market" value="' + esc(m.buildingName || "") + '">');
    html += field("사건번호", '<input type="text" class="inline-select" data-inline-text="caseNumber" data-id="' + m.id + '" data-entity="market" value="' + esc(m.caseNumber || "") + '">');
    html += field("법원", '<input type="text" class="inline-select" data-inline-text="court" data-id="' + m.id + '" data-entity="market" value="' + esc(m.court || "") + '">');
    html += field("지역", '<input type="text" class="inline-select" data-inline-text="region" data-id="' + m.id + '" data-entity="market" value="' + esc(m.region || "") + '">');
    html += field("물건종류", selectHtml("propertyType", MARKET_PROPERTY_TYPES, m.propertyType, m.id, "market"));
    html += field("상태", selectHtml("status", MARKET_STATUS, m.status, m.id, "market"));
    html += field("소재지", '<input type="text" class="inline-select" data-inline-text="address" data-id="' + m.id + '" data-entity="market" value="' + esc(m.address || "") + '">', "grow");
    html += field("감정가(원)", '<input type="number" class="inline-select" min="0" step="1000000" data-inline-number="appraisalValue" data-id="' + m.id + '" data-entity="market" value="' + (m.appraisalValue || 0) + '">');
    html += field("최저매각가(원)", '<input type="number" class="inline-select" min="0" step="1000000" data-inline-number="minSalePrice" data-id="' + m.id + '" data-entity="market" value="' + (m.minSalePrice || 0) + '">');
    html += field("낙찰가(원)", '<input type="number" class="inline-select" min="0" step="1000000" data-inline-number="winningBid" data-id="' + m.id + '" data-entity="market" value="' + (m.winningBid || 0) + '">');
    html += field("매각기일", '<input type="date" class="inline-select" data-inline-date="saleDate" data-id="' + m.id + '" data-entity="market" value="' + esc(m.saleDate || "") + '">');
    html += field("유찰횟수", '<input type="number" class="inline-select" min="0" step="1" data-inline-number="failCount" data-id="' + m.id + '" data-entity="market" value="' + (m.failCount || 0) + '">');
    html += field("유찰 처리", marketFailBidFieldHtml(m), "grow");
    html += field("권리분석", marketAnalysisBtnHtml(m), "grow");
    html += field("메모", '<textarea class="inline-select" data-inline-text="memo" data-id="' + m.id + '" data-entity="market" placeholder="권리분석 메모 등" style="min-height:80px">' + esc(m.memo || "") + "</textarea>", "grow");
    html += "</div>";
    html += '<div class="card-detail-footer"><button type="button" class="btn btn-danger-ghost btn-sm" data-del="market" data-id="' + m.id + '">🗑 이 건 삭제</button></div>';
    html += "</div></div>";
    return html;
  }

  /* ---------------- Student DB ---------------- */
  // 수강 문의 때 이름을 안 알려주는 분이 있어서 이름이 빈 DB 항목이 생긴다. 뒷번호로 구분해 보여주고,
  // 나중에 이름을 알게 되면 목록·홈에서 바로 채울 수 있게 한다.
  function dbDisplayName(s) {
    if (s && s.name) return s.name;
    var tail = (s && s.phone ? String(s.phone).replace(/[^0-9]/g, "").slice(-4) : "");
    return "이름 미상" + (tail ? "(" + tail + ")" : "");
  }
  function namelessDbEntries() {
    return state.studentDb.filter(function (s) { return !(s.name || "").trim(); });
  }
  function findStudentDbByName(name) {
    var norm = (name || "").trim();
    if (!norm) return null;
    return state.studentDb.find(function (d) { return (d.name || "").trim() === norm; }) || null;
  }

  function studentDbCourseCounts() {
    var counts = { basic: 0, intermediate: 0, regular: 0, advanced: 0, consulting: 0, trial: 0 };
    state.studentDb.forEach(function (s) {
      STUDENT_DB_COURSE_KEYS.forEach(function (k) { if (s.courses && s.courses[k]) counts[k]++; });
    });
    return counts;
  }

  function studentDbSelectHtml(field, options, selected, rowId) {
    var opts = '<option value=""' + (!selected ? " selected" : "") + ">-</option>" + options.map(function (o) {
      return '<option value="' + esc(o) + '"' + (o === selected ? " selected" : "") + ">" + esc(o) + "</option>";
    }).join("");
    if (rowId) {
      return '<select class="inline-select" data-inline-select="' + field + '" data-id="' + rowId + '" data-entity="studentDb">' + opts + "</select>";
    }
    return '<select name="' + field + '">' + opts + "</select>";
  }

  function linkStudentDbToRevenue(sdbId) {
    // 수강생 DB는 명단 수집용이므로 반/금액은 추측해서 채우지 않고, "등록됨" 연동만 만든다.
    // 실제 반과 금액은 수강생 · 매출 탭에서 사람이 직접 선택·입력한다.
    var s = state.studentDb.find(function (x) { return x.id === sdbId; });
    if (!s || s.linkedStudentId) return;
    var newId = uid();
    state.students.push({
      id: newId, name: s.name, level: STUDENT_LEVELS[0], appliedDate: s.registeredDate || todayStr(),
      status: "등록완료", paymentType: "단발성",
      tuition: 0, paid: false, taxInvoice: false, cardPayment: false,
      monthlyAmount: 0, installments: [],
      memo: "",
      studentDbId: s.id
    });
    s.linkedStudentId = newId;
  }

  function unlinkStudentDbFromRevenue(sdbId) {
    // "+ 매출 등록"을 잘못 눌렀을 때 되돌리는 기능. 연동 시 함께 만들어진
    // 수강생 · 매출 레코드를 지우고 연동 표시를 원래대로 되돌린다.
    var s = state.studentDb.find(function (x) { return x.id === sdbId; });
    if (!s || !s.linkedStudentId) return;
    state.students = state.students.filter(function (x) { return x.id !== s.linkedStudentId; });
    s.linkedStudentId = null;
  }

  function studentDbMonthlyStats() {
    var map = {};
    state.studentDb.forEach(function (s) {
      var mk = s.registeredDate ? s.registeredDate.slice(0, 7) : "unknown";
      if (!map[mk]) map[mk] = { count: 0, basic: 0, intermediate: 0, regular: 0, advanced: 0, consulting: 0, trial: 0 };
      map[mk].count++;
      STUDENT_DB_COURSE_KEYS.forEach(function (k) { if (s.courses && s.courses[k]) map[mk][k]++; });
    });
    return map;
  }

  /* ---------------- 신규 수강생 등록 마법사 ---------------- */
  // 수강생 DB 등록 → 반·수강료(매출) 등록 → 은행 입금 연결까지, 세 탭을 오가며 하던 일을
  // 한 카드에서 순서대로 처리한다. 만들어지는 데이터 모양은 기존 세 흐름과 동일하다.
  var wizardOpen = false;
  var wizardStep = 1;
  var wizardData = null;

  function wizardDefaults() {
    var courses = {};
    STUDENT_DB_COURSE_KEYS.forEach(function (k) { courses[k] = k === "basic"; });
    return {
      name: "", phone: "", registeredDate: todayStr(), courses: courses, classTime: "", courseType: "", memo: "",
      level: "초급반", levelTouched: false, paymentType: "단발성", tuition: 0, monthlyAmount: 0,
      courseStartDate: "", courseStartTouched: false, isTrial: false,
      payMode: "bank", txId: "", paidDate: "",
      existingDbId: null, existingStudentId: null
    };
  }
  function wizardDbOptionLabel(s) {
    return dbDisplayName(s) + " · " + (s.phone || "연락처 없음") + " · " + (s.registeredDate ? formatShortDate(s.registeredDate) : "날짜 미상") + (s.linkedStudentId ? " · 매출등록됨" : "");
  }
  function wizardPrefillFromDb(dbId) {
    // 기존 수강생 DB 항목을 마법사에 불러온다. 이미 매출 연동된 학생이면 그 반·수강료·입금 상태까지 가져와서
    // "등록 완료" 때 새로 만들지 않고 기존 항목을 갱신하게 한다.
    var s = state.studentDb.find(function (x) { return x.id === dbId; });
    if (!s) return false;
    var d = wizardDefaults();
    d.existingDbId = s.id;
    d.name = s.name || ""; d.phone = s.phone || ""; d.registeredDate = s.registeredDate || todayStr();
    STUDENT_DB_COURSE_KEYS.forEach(function (k) { d.courses[k] = !!(s.courses && s.courses[k]); });
    d.classTime = s.classTime || ""; d.courseType = s.courseType || ""; d.memo = s.memo || "";
    d.isTrial = !!(s.courses && s.courses.trial);
    d.level = wizardLevelFromCourses(d.courses);
    var st = s.linkedStudentId ? state.students.find(function (x) { return x.id === s.linkedStudentId; }) : null;
    if (st) {
      d.existingStudentId = st.id;
      d.level = st.level || d.level; d.levelTouched = true;
      d.paymentType = st.paymentType || "단발성";
      d.tuition = st.tuition || 0; d.monthlyAmount = st.monthlyAmount || 0;
      if (st.courseStartDate) { d.courseStartDate = st.courseStartDate; d.courseStartTouched = true; }
      if (st.cardPayment) d.payMode = "card";
      if (st.paidDate) d.paidDate = st.paidDate;
      if (/체험단/.test(st.memo || "")) d.isTrial = true;
      if (d.memo === "" && st.memo && !/체험단/.test(st.memo)) d.memo = st.memo;
    } else if (s.amount > 0) {
      d.tuition = s.amount;
    }
    if (d.isTrial) d.memo = d.memo.replace(/^블로그 체험단 · 무료 수강권( · )?/, "");
    wizardData = d;
    return true;
  }
  function wizardLevelFromCourses(courses) {
    if (courses.consulting) return "컨설팅반";
    if (courses.advanced) return "고급반(오프라인)";
    if (courses.intermediate) return "중급반";
    return "초급반";
  }
  function wizardDefaultCourseStart(level) {
    // 지금 진행중인 같은 반 학생들에게 가장 많이 지정된 개강일 = 현재 기수 개강일로 제안한다.
    if (!FIXED_COURSE_WEEKS[level]) return "";
    var counts = {};
    state.students.forEach(function (s) {
      if (s.level === level && s.courseStartDate && studentCourseStatus(s) === "진행중") counts[s.courseStartDate] = (counts[s.courseStartDate] || 0) + 1;
    });
    var best = "", n = 0;
    Object.keys(counts).forEach(function (dt) { if (counts[dt] > n) { best = dt; n = counts[dt]; } });
    return best;
  }
  function wizardCandidateTransactions() {
    return state.transactions.filter(function (t) { return t.deposit > 0 && !t.category; })
      .slice().sort(function (a, b) { return (b.date || "").localeCompare(a.date || ""); }).slice(0, 20);
  }
  function wizardCollect() {
    var d = wizardData;
    if (!d) return;
    var g = function (id) { var el = document.getElementById(id); return el ? el.value : null; };
    if (wizardStep === 1) {
      d.name = (g("w_name") || "").trim();
      d.phone = (g("w_phone") || "").trim();
      d.registeredDate = g("w_registeredDate") || "";
      STUDENT_DB_COURSE_KEYS.forEach(function (k) { var el = document.getElementById("w_course_" + k); if (el) d.courses[k] = el.checked; });
      d.classTime = g("w_classTime") || "";
      d.courseType = g("w_courseType") || "";
      d.memo = (g("w_memo") || "").trim();
      if (d.courses.trial) d.isTrial = true;
      if (!d.levelTouched) d.level = wizardLevelFromCourses(d.courses);
    } else if (wizardStep === 2) {
      var trialEl = document.getElementById("w_isTrial");
      if (trialEl) d.isTrial = trialEl.checked;
      var lv = g("w_level");
      if (lv) { if (lv !== d.level) d.courseStartTouched = false; d.level = lv; d.levelTouched = true; }
      d.paymentType = g("w_paymentType") || d.paymentType;
      var tu = g("w_tuition"); if (tu !== null) d.tuition = Number(tu) || 0;
      var ma = g("w_monthlyAmount"); if (ma !== null) d.monthlyAmount = Number(ma) || 0;
      var cs = g("w_courseStartDate");
      if (cs !== null) { d.courseStartDate = cs; d.courseStartTouched = true; }
    } else if (wizardStep === 3) {
      var pm = document.querySelector('input[name="w_payMode"]:checked');
      if (pm) d.payMode = pm.value;
      var tx = document.querySelector('input[name="w_tx"]:checked');
      d.txId = tx ? tx.value : "";
      d.paidDate = g("w_paidDate") || "";
    }
  }
  function wizardValidateStep() {
    var d = wizardData;
    if (wizardStep === 1 && !d.name) { toast("이름을 입력해주세요."); return false; }
    if (wizardStep === 2 && !d.isTrial) {
      if (d.paymentType === "월별" && !(d.monthlyAmount > 0)) { toast("월 금액을 입력해주세요. (무료 체험단이면 체험단에 체크)"); return false; }
      if (d.paymentType !== "월별" && !(d.tuition > 0)) { toast("수강료를 입력해주세요. (무료 체험단이면 체험단에 체크)"); return false; }
    }
    if (wizardStep === 3 && d.payMode === "bank" && !d.txId) { toast("연결할 입금 건을 선택하거나, '나중에 연결'을 고르세요."); return false; }
    return true;
  }
  function wizardHtml() {
    if (!wizardData) wizardData = wizardDefaults();
    var d = wizardData;
    var html = '<div class="card wizard-card" style="margin-bottom:22px">';
    html += '<div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap"><h3 style="margin:0">🧭 신규 수강생 등록 마법사</h3>';
    html += '<button type="button" class="btn ' + (wizardOpen ? "btn-ghost" : "btn-primary") + ' btn-sm" id="wizardToggleBtn">' + (wizardOpen ? "닫기" : "+ 새 수강생 등록 시작") + "</button></div>";
    html += '<div class="sub" style="margin-top:4px">수강생 DB 등록 → 반·수강료(매출) → 입금 연결을 한 번에 처리합니다. 은행 거래내역 탭을 따로 오갈 필요가 없어요.</div>';
    if (!wizardOpen) return html + "</div>";

    var steps = ["기본 정보", "반 · 수강료", "입금 연결", "확인"];
    html += '<div class="wizard-steps">' + steps.map(function (label, i) {
      var n = i + 1;
      var cls = n === wizardStep ? " is-current" : n < wizardStep ? " is-done" : "";
      return '<div class="wizard-step' + cls + '"><span class="wizard-step-n">' + (n < wizardStep ? "✓" : n) + "</span>" + esc(label) + "</div>";
    }).join("") + "</div>";

    html += '<div class="wizard-body">';
    if (wizardStep === 1) {
      if (d.existingDbId) {
        var exDb = state.studentDb.find(function (x) { return x.id === d.existingDbId; });
        html += '<div class="wizard-existing">📎 기존 수강생 DB 항목 <b>' + esc(exDb ? exDb.name : "") + "</b>을(를) 불러왔습니다" + (d.existingStudentId ? " · 매출 정보도 함께 가져옴" : "") + '. 등록 완료 시 새로 만들지 않고 이 항목을 갱신합니다. <button type="button" class="btn btn-ghost btn-sm" id="w_dbClear">불러오기 취소</button></div>';
      } else {
        html += '<div class="wizard-load"><label for="w_dbPick">📎 기존 수강생 DB에서 불러오기</label>' +
          '<input type="text" id="w_dbPick" list="w_dbList" placeholder="이름을 입력해 선택 (문의·체험단·미연동 학생 모두 가능)" autocomplete="off">' +
          '<datalist id="w_dbList">' + state.studentDb.slice().sort(function (a, b) { return (b.registeredDate || "").localeCompare(a.registeredDate || ""); }).map(function (s) {
            return '<option value="' + esc(wizardDbOptionLabel(s)) + '" data-id="' + esc(s.id) + '"></option>';
          }).join("") + "</datalist>" +
          '<span class="meta">비워두면 새 수강생으로 등록됩니다</span></div>';
      }
      html += '<div class="wizard-fields">';
      html += field("이름 *", '<input type="text" id="w_name" value="' + esc(d.name) + '" placeholder="예: 홍길동" autocomplete="off">');
      html += field("연락처", '<input type="text" id="w_phone" data-phone-input value="' + esc(d.phone) + '" placeholder="010-0000-0000">');
      html += field("등록일(신청일)", '<input type="date" id="w_registeredDate" value="' + esc(d.registeredDate) + '">');
      html += field("수강과정", '<div style="display:flex;flex-wrap:wrap;gap:6px 14px;padding:8px 0">' + STUDENT_DB_COURSE_KEYS.map(function (k) {
        return '<label style="display:inline-flex;align-items:center;gap:5px;font-weight:400;white-space:nowrap"><input type="checkbox" id="w_course_' + k + '"' + (d.courses[k] ? " checked" : "") + "> " + STUDENT_DB_COURSE_LABELS[k] + "</label>";
      }).join("") + "</div>", "grow");
      html += field("수업시간", '<select id="w_classTime"><option value="">-</option>' + STUDENT_DB_CLASS_TIME_OPTIONS.map(function (o) { return '<option value="' + esc(o) + '"' + (o === d.classTime ? " selected" : "") + ">" + esc(o) + "</option>"; }).join("") + "</select>");
      html += field("수강형태", '<select id="w_courseType"><option value="">-</option>' + STUDENT_DB_COURSE_TYPE_OPTIONS.map(function (o) { return '<option value="' + esc(o) + '"' + (o === d.courseType ? " selected" : "") + ">" + esc(o) + "</option>"; }).join("") + "</select>");
      html += field("메모", '<input type="text" id="w_memo" value="' + esc(d.memo) + '" placeholder="비고">', "grow");
      html += "</div>";
      html += '<div class="wizard-hint">💡 "체험단"에 체크하면 다음 단계에서 무료 수강권(수강료 0원, 매출 미집계)으로 자동 처리됩니다.</div>';
    } else if (wizardStep === 2) {
      if (!d.courseStartTouched && !d.courseStartDate) d.courseStartDate = wizardDefaultCourseStart(d.level);
      var isMonthly = d.paymentType === "월별";
      html += '<div class="wizard-fields">';
      html += field("체험단(무료 수강권)", '<label style="display:inline-flex;align-items:center;gap:6px;font-weight:400;padding:8px 0"><input type="checkbox" id="w_isTrial"' + (d.isTrial ? " checked" : "") + "> 블로그 체험단 · 수강료 0원</label>");
      html += field("반", '<select id="w_level">' + STUDENT_LEVELS.map(function (l) { return '<option value="' + esc(l) + '"' + (l === d.level ? " selected" : "") + ">" + esc(l) + "</option>"; }).join("") + "</select>");
      html += field("결제방식", '<select id="w_paymentType">' + PAYMENT_TYPES.map(function (p) { return '<option value="' + esc(p) + '"' + (p === d.paymentType ? " selected" : "") + ">" + esc(p) + "</option>"; }).join("") + "</select>");
      if (!d.isTrial) {
        if (isMonthly) html += field("월 금액(원)", '<input type="number" id="w_monthlyAmount" min="0" step="10000" value="' + (d.monthlyAmount || "") + '" placeholder="예: 500000">');
        else html += field("수강료(원)", '<input type="number" id="w_tuition" min="0" step="10000" value="' + (d.tuition || "") + '" placeholder="예: 330000">');
      }
      if (FIXED_COURSE_WEEKS[d.level]) {
        html += field("개강일(기수)", '<input type="date" id="w_courseStartDate" value="' + esc(d.courseStartDate || "") + '">');
      }
      html += "</div>";
      if (FIXED_COURSE_WEEKS[d.level]) {
        html += '<div class="wizard-hint">📅 ' + esc(d.level) + "은 5주 과정입니다. " + (d.courseStartDate && !d.courseStartTouched ? "현재 진행중인 기수 개강일(" + esc(formatShortDate(d.courseStartDate)) + ")을 자동으로 넣어뒀어요. 다른 기수면 바꿔주세요." : "이번 기수 개강일을 넣으면 진행중/종료가 정확히 계산됩니다.") + "</div>";
      }
      if (d.isTrial) html += '<div class="wizard-hint">🎟 체험단으로 등록됩니다 — 수강료 0원, 입금 연결 없이 완료되고 매출·미수금 집계에서 제외됩니다.</div>';
    } else if (wizardStep === 3) {
      if (d.isTrial) {
        html += '<div class="wizard-hint">🎟 체험단(무료 수강권)이라 입금 연결이 필요 없습니다. "다음"을 눌러 확인 단계로 가세요.</div>';
        d.payMode = "free";
      } else {
        var modes = [["bank", "은행 입금 연결"], ["card", "카드결제 (은행 입금 없음)"], ["later", "나중에 연결 (미입금 상태로 등록)"]];
        html += '<div class="wizard-modes">' + modes.map(function (m) {
          return '<label class="wizard-mode' + (d.payMode === m[0] ? " is-selected" : "") + '"><input type="radio" name="w_payMode" value="' + m[0] + '"' + (d.payMode === m[0] ? " checked" : "") + "> " + esc(m[1]) + "</label>";
        }).join("") + "</div>";
        if (d.payMode === "bank") {
          var cands = wizardCandidateTransactions();
          var expect = d.paymentType === "월별" ? d.monthlyAmount : d.tuition;
          if (!cands.length) {
            html += '<div class="empty-state">미확정 입금 건이 없습니다. 은행 거래내역을 먼저 업로드하거나, "나중에 연결"을 선택하세요.</div>';
          } else {
            html += '<div class="wizard-hint">최근 미확정 입금 ' + cands.length + "건 · 금액이 " + won(expect) + "와 같은 건은 ✅로 표시됩니다.</div>";
            html += '<div class="wizard-tx-list">' + cands.map(function (t) {
              var match = expect > 0 && t.deposit === expect;
              return '<label class="wizard-tx-item' + (d.txId === t.id ? " is-selected" : "") + (match ? " is-match" : "") + '"><input type="radio" name="w_tx" value="' + esc(t.id) + '"' + (d.txId === t.id ? " checked" : "") + '><span class="wizard-tx-date">' + esc(formatShortDate(t.date)) + '</span><span class="wizard-tx-desc">' + esc(t.description || "적요 없음") + '</span><span class="wizard-tx-amt">' + won(t.deposit) + (match ? " ✅" : "") + "</span></label>";
            }).join("") + "</div>";
          }
        } else if (d.payMode === "card") {
          html += '<div class="wizard-fields">' + field("결제일", '<input type="date" id="w_paidDate" value="' + esc(d.paidDate || d.registeredDate || todayStr()) + '">') + "</div>";
          html += '<div class="wizard-hint">카드결제로 표시되고 입금완료 처리됩니다. 은행 입금 건과는 연결하지 않아요.</div>';
        } else {
          html += '<div class="wizard-hint">미입금 상태로 등록됩니다. 나중에 은행 거래내역 탭에서 입금 건을 이 학생과 연결하면 됩니다.</div>';
        }
      }
    } else {
      var txSel = d.payMode === "bank" && d.txId ? state.transactions.find(function (t) { return t.id === d.txId; }) : null;
      var payLabel = d.isTrial ? "체험단 · 무료 수강권 (0원)" : txSel ? "은행 입금 연결 · " + formatShortDate(txSel.date) + " " + won(txSel.deposit) : d.payMode === "card" ? "카드결제 · " + formatShortDate(d.paidDate || d.registeredDate || todayStr()) : "나중에 연결 (미입금)";
      var rows = [
        ["처리 방식", d.existingDbId ? (d.existingStudentId ? "기존 수강생 DB · 매출 항목 갱신" : "기존 수강생 DB 항목 갱신 + 매출 등록") : "신규 등록 (DB + 매출)"],
        ["이름 / 연락처", esc(d.name) + (d.phone ? " · " + esc(d.phone) : "")],
        ["등록일", esc(formatShortDate(d.registeredDate || todayStr()))],
        ["수강과정", STUDENT_DB_COURSE_KEYS.filter(function (k) { return d.courses[k] || (k === "trial" && d.isTrial); }).map(function (k) { return STUDENT_DB_COURSE_LABELS[k]; }).join(", ") || "-"],
        ["반 / 결제방식", esc(d.level) + " · " + esc(d.paymentType)],
        [d.paymentType === "월별" ? "월 금액" : "수강료", d.isTrial ? "0원 (무료)" : won(d.paymentType === "월별" ? d.monthlyAmount : d.tuition)],
        ["개강일", FIXED_COURSE_WEEKS[d.level] ? (d.courseStartDate ? esc(formatShortDate(d.courseStartDate)) : "미지정 (신청일 기준 계산)") : "해당 없음"],
        ["입금", esc(payLabel)]
      ];
      html += '<div class="wizard-summary">' + rows.map(function (r) { return '<div class="hub-row"><span class="hub-label">' + r[0] + '</span><span class="hub-value">' + r[1] + "</span></div>"; }).join("") + "</div>";
      html += '<div class="wizard-hint">✅ "등록 완료"를 누르면 수강생 DB · 수강생/매출 · (선택 시) 은행 입금 연결이 한 번에 만들어집니다.</div>';
    }
    html += "</div>";

    html += '<div class="wizard-actions">';
    if (wizardStep > 1) html += '<button type="button" class="btn btn-ghost" id="wizardPrevBtn">← 이전</button>';
    if (wizardStep < 4) html += '<button type="button" class="btn btn-primary" id="wizardNextBtn">다음 →</button>';
    else html += '<button type="button" class="btn btn-primary" id="wizardCommitBtn">✅ 등록 완료</button>';
    html += '<button type="button" class="btn btn-ghost btn-sm" id="wizardResetBtn" style="margin-left:auto">처음부터</button>';
    html += "</div></div>";
    return html;
  }
  function wizardCommit() {
    var d = wizardData;
    if (!d || !d.name) { toast("이름을 입력해주세요."); wizardStep = 1; render(); return; }
    var doCommit = function () {
      var isMonthly = d.paymentType === "월별";
      var tx = d.payMode === "bank" && d.txId ? state.transactions.find(function (t) { return t.id === d.txId; }) : null;
      var paid = d.isTrial || d.payMode === "card" || !!tx;
      var paidDate = tx ? tx.date : d.payMode === "card" ? (d.paidDate || d.registeredDate || todayStr()) : d.isTrial ? (d.registeredDate || todayStr()) : null;
      var tuition = d.isTrial || isMonthly ? 0 : d.tuition;
      var monthlyAmount = d.isTrial || !isMonthly ? 0 : d.monthlyAmount;
      var memo = d.isTrial ? ("블로그 체험단 · 무료 수강권" + (d.memo ? " · " + d.memo : "")) : d.memo;
      var courses = {};
      STUDENT_DB_COURSE_KEYS.forEach(function (k) { courses[k] = !!d.courses[k]; });
      if (d.isTrial) courses.trial = true;

      // 기존 DB 항목을 불러온 경우: 새로 만들지 않고 그 항목(과 연동된 매출 항목)을 갱신한다.
      var db = d.existingDbId ? state.studentDb.find(function (x) { return x.id === d.existingDbId; }) : null;
      var st = d.existingStudentId ? state.students.find(function (x) { return x.id === d.existingStudentId; }) : null;
      var isUpdate = !!db;
      if (!db) {
        db = { id: uid(), cashReceipt: null };
        state.studentDb.push(db);
      }
      if (!st) {
        st = { id: uid(), status: "등록완료", taxInvoice: false, installments: [], paid: false, paidDate: null };
        state.students.push(st);
      }
      db.name = d.name; db.phone = d.phone || null; db.registeredDate = d.registeredDate || null; db.courses = courses;
      db.amount = d.isTrial ? 0 : ((isMonthly ? monthlyAmount : tuition) || db.amount || null);
      db.courseType = d.courseType || null; db.classTime = d.classTime || null;
      if (tx) db.paymentStatus = "입금완료"; else if (d.payMode === "card") db.paymentStatus = "카드결제"; else if (!isUpdate) db.paymentStatus = null;
      if (paid) db.paymentDate = paidDate; else if (!isUpdate) db.paymentDate = null;
      db.memo = memo || null;
      db.linkedStudentId = st.id;

      st.name = d.name; st.level = d.level; st.appliedDate = d.registeredDate || st.appliedDate || todayStr();
      st.status = "등록완료"; st.paymentType = d.paymentType;
      st.tuition = tuition; st.monthlyAmount = monthlyAmount; st.memo = memo; st.studentDbId = db.id;
      if (d.payMode === "card") st.cardPayment = true;
      if (!isMonthly && paid) { st.paid = true; st.paidDate = paidDate; }
      if (d.courseStartDate && FIXED_COURSE_WEEKS[d.level]) st.courseStartDate = d.courseStartDate;
      var installmentId = null;
      if (isMonthly && paid && !d.isTrial) {
        st.installments = st.installments || [];
        var inst = { id: uid(), round: st.installments.length + 1, month: (paidDate || todayStr()).slice(0, 7), amount: monthlyAmount, paid: true, taxInvoice: false, cardPayment: d.payMode === "card" };
        st.installments.push(inst);
        installmentId = inst.id;
      }
      if (tx) { tx.studentId = st.id; tx.category = "tuition"; tx.installmentId = installmentId; }
      saveState();
      toast(d.name + "님 " + (isUpdate ? "정보 갱신 완료" : "등록 완료") + (tx ? " · 입금 연결됨" : d.payMode === "card" ? " · 카드결제" : d.isTrial ? " · 체험단(무료)" : " · 입금은 나중에 연결"));
      wizardOpen = false; wizardStep = 1; wizardData = null;
      render();
    };
    var dup = d.existingDbId ? null : findStudentDbByName(d.name);
    if (dup) {
      customConfirm(d.name + "님은 이미 수강생 DB에 등록되어 있습니다" + (dup.registeredDate ? " (등록일 " + formatShortDate(dup.registeredDate) + ")" : "") + ".\n동명이인이 맞으면 계속 진행하고, 같은 사람이면 취소 후 기존 항목을 사용해주세요.\n\n그래도 새로 등록하시겠습니까?", doCommit);
    } else {
      doCommit();
    }
  }
  function bindWizard() {
    var byId = function (id) { return document.getElementById(id); };
    if (byId("wizardToggleBtn")) byId("wizardToggleBtn").addEventListener("click", function () { wizardOpen = !wizardOpen; if (wizardOpen && !wizardData) wizardData = wizardDefaults(); render(); });
    if (byId("wizardNextBtn")) byId("wizardNextBtn").addEventListener("click", function () { wizardCollect(); if (!wizardValidateStep()) return; wizardStep++; render(); });
    if (byId("wizardPrevBtn")) byId("wizardPrevBtn").addEventListener("click", function () { wizardCollect(); wizardStep--; render(); });
    if (byId("wizardResetBtn")) byId("wizardResetBtn").addEventListener("click", function () { wizardData = wizardDefaults(); wizardStep = 1; render(); });
    if (byId("wizardCommitBtn")) byId("wizardCommitBtn").addEventListener("click", function () { wizardCollect(); wizardCommit(); });
    ["w_level", "w_paymentType", "w_isTrial"].forEach(function (id) {
      if (byId(id)) byId(id).addEventListener("change", function () { wizardCollect(); render(); });
    });
    Array.prototype.forEach.call(document.querySelectorAll('input[name="w_payMode"]'), function (r) {
      r.addEventListener("change", function () { wizardCollect(); render(); });
    });
    Array.prototype.forEach.call(document.querySelectorAll('input[name="w_tx"]'), function (r) {
      r.addEventListener("change", function () { wizardCollect(); render(); });
    });
    var dbPick = byId("w_dbPick");
    if (dbPick) {
      dbPick.addEventListener("change", function () {
        var val = dbPick.value.trim();
        if (!val) return;
        var opt = Array.prototype.find.call(document.querySelectorAll("#w_dbList option"), function (o) { return o.value === val; });
        if (!opt) { toast("목록에서 이름을 선택해주세요."); return; }
        if (wizardPrefillFromDb(opt.getAttribute("data-id"))) render();
      });
    }
    if (byId("w_dbClear")) byId("w_dbClear").addEventListener("click", function () { wizardData = wizardDefaults(); render(); });
    var nameEl = byId("w_name");
    if (nameEl && wizardStep === 1 && !nameEl.value && !dbPick) nameEl.focus();
  }

  function renderStudentDb() {
    var counts = studentDbCourseCounts();
    var monthlyStats = studentDbMonthlyStats();
    var dupNames = buildDupNameMap(state.studentDb);
    var searchQuery = studentDbSearchQuery.trim().toLowerCase();
    var filtered = state.studentDb.filter(function (s) {
      if (studentDbFilterCourse !== "all" && !(s.courses && s.courses[studentDbFilterCourse])) return false;
      if (studentDbFilterMonth !== "all") {
        var mk = s.registeredDate ? s.registeredDate.slice(0, 7) : "unknown";
        if (mk !== studentDbFilterMonth) return false;
      }
      if (searchQuery) {
        var haystack = [s.name, s.phone, s.courseType, s.classTime, s.memo].join(" ").toLowerCase();
        if (haystack.indexOf(searchQuery) === -1) return false;
      }
      return true;
    });

    var html = "";
    html += '<div class="page-head"><div><h1>수강생 DB</h1><div class="sub">업로드한 수강생 명단을 검색·필터로 바로 찾아볼 수 있습니다</div></div></div>';

    html += '<div class="kpi-grid">';
    html += kpiCard("전체 등록 인원", state.studentDb.length, "명");
    STUDENT_DB_COURSE_KEYS.forEach(function (k) {
      html += kpiCard(STUDENT_DB_COURSE_LABELS[k] + " 수강", counts[k], "명");
    });
    html += "</div>";

    var monthKeys = Object.keys(monthlyStats).filter(function (k) { return k !== "unknown"; }).sort().reverse();
    html += '<div class="month-scroller">';
    html += '<div class="month-card" data-studentdb-month-select="all" aria-pressed="' + (studentDbFilterMonth === "all") + '"><div class="m">전체</div><div class="row"><span class="l">인원</span><span>' + state.studentDb.length + "명</span></div></div>";
    monthKeys.forEach(function (mk) {
      var st = monthlyStats[mk];
      html += '<div class="month-card" data-studentdb-month-select="' + mk + '" aria-pressed="' + (studentDbFilterMonth === mk) + '">';
      html += '<div class="m">' + esc(monthLabel(mk)) + "</div>";
      html += '<div class="row"><span class="l">인원</span><span>' + st.count + "명</span></div>";
      html += '<div class="row"><span class="l">초급/중급</span><span>' + st.basic + "/" + st.intermediate + "</span></div>";
      html += '<div class="row"><span class="l">정규/고급</span><span>' + st.regular + "/" + st.advanced + "</span></div>";
      html += "</div>";
    });
    if (monthlyStats.unknown) {
      html += '<div class="month-card" data-studentdb-month-select="unknown" aria-pressed="' + (studentDbFilterMonth === "unknown") + '">';
      html += '<div class="m">날짜 미상</div>';
      html += '<div class="row"><span class="l">인원</span><span>' + monthlyStats.unknown.count + "명</span></div>";
      html += "</div>";
    }
    html += "</div>";

    html += wizardHtml();

    html += '<form class="add-form" id="studentDbForm">';
    html += field("이름", '<input type="text" name="name" placeholder="예: 홍길동" required>');
    html += field("연락처", '<input type="text" name="phone" data-phone-input placeholder="010-0000-0000">');
    html += field("등록일", '<input type="date" name="registeredDate">');
    html += field("수강과정", STUDENT_DB_COURSE_KEYS.map(function (k) {
      return '<label style="display:inline-flex;align-items:center;gap:4px;margin-right:12px;font-weight:400"><input type="checkbox" name="course_' + k + '"> ' + STUDENT_DB_COURSE_LABELS[k] + "</label>";
    }).join(""), "grow");
    html += field("금액(원)", '<input type="number" name="amount" min="0" step="10000">');
    html += field("수강형태", studentDbSelectHtml("courseType", STUDENT_DB_COURSE_TYPE_OPTIONS, ""));
    html += field("수업시간", studentDbSelectHtml("classTime", STUDENT_DB_CLASS_TIME_OPTIONS, ""));
    html += field("입금상태", studentDbSelectHtml("paymentStatus", STUDENT_DB_PAYMENT_STATUS_OPTIONS, ""));
    html += field("입금일", '<input type="date" name="paymentDate">');
    html += field("메모", '<input type="text" name="memo" placeholder="비고">', "grow");
    html += '<button type="submit" class="btn btn-primary">+ 수강생 추가</button>';
    html += "</form>";

    html += '<div class="card section-gap"><h3>과정별 인원<span class="count">전체 ' + state.studentDb.length + '명</span></h3>';
    html += STUDENT_DB_COURSE_KEYS.map(function (k) {
      var n = counts[k];
      var max = Math.max.apply(null, STUDENT_DB_COURSE_KEYS.map(function (kk) { return counts[kk]; }).concat([1]));
      var pct = Math.round((n / max) * 100);
      return '<div class="stage-row"><div class="name">' + esc(STUDENT_DB_COURSE_LABELS[k]) + '</div><div class="bar-track"><div class="bar-fill" style="width:' + pct + '%"></div></div><div class="n">' + n + "명</div></div>";
    }).join("");
    html += "</div>";

    var nameless = namelessDbEntries();
    if (nameless.length) {
      html += '<div class="card section-gap db-nameless-card"><h3>📝 이름 미상 문의 <span class="count">' + nameless.length + '명 · 이름을 알게 되면 여기서 바로 입력</span></h3>';
      html += '<div class="sub" style="margin-bottom:10px">문의 때 성함을 안 알려주신 분들입니다. 뒷번호로 구분해 두었으니, 상담·입금 때 이름을 확인하면 칸에 적고 Enter를 누르세요. 전화번호·등록일·메모는 그대로 유지됩니다.</div>';
      nameless.slice().sort(function (a, b) { return (b.registeredDate || "").localeCompare(a.registeredDate || ""); }).forEach(function (s) {
        html += '<div class="db-nameless-row"><span class="db-nameless-phone">' + esc(s.phone || "연락처 없음") + '</span><span class="meta">' + (s.registeredDate ? formatShortDate(s.registeredDate) : "날짜 미상") + (s.memo ? " · " + esc(s.memo) : "") + '</span>' +
          '<input type="text" class="inline-select db-name-fill" data-inline-text="name" data-id="' + s.id + '" data-entity="studentDb" placeholder="이름 입력 → Enter" value=""></div>';
      });
      html += "</div>";
    }
    html += '<div class="filter-bar section-gap">';
    html += '<input type="text" id="studentDbSearchInput" class="inline-select" placeholder="🔍 이름·연락처·메모 검색" value="' + esc(studentDbSearchQuery) + '" style="min-width:260px;flex:1">';
    html += "</div>";

    html += '<div class="filter-bar">' + ["all"].concat(STUDENT_DB_COURSE_KEYS).map(function (k) {
      var label = k === "all" ? "전체" : STUDENT_DB_COURSE_LABELS[k];
      var n = k === "all" ? state.studentDb.length : counts[k];
      return '<button class="filter-chip" data-studentdb-course-filter="' + k + '" aria-pressed="' + (studentDbFilterCourse === k) + '">' + esc(label) + " (" + n + ")</button>";
    }).join("") + "</div>";

    var COLSPAN = 7;
    html += '<div class="table-wrap"><table class="data-table mobile-fit"><thead><tr>' +
      '<th></th><th>이름</th><th class="col-mobile-hide">연락처</th><th class="col-mobile-hide">등록일</th><th>수강과정</th><th>매출연동</th><th></th>' +
      "</tr></thead><tbody>";
    if (filtered.length === 0) {
      html += '<tr><td colspan="' + COLSPAN + '"><div class="empty-state">해당하는 수강생이 없습니다.</div></td></tr>';
    } else {
      filtered.slice().sort(function (a, b) { return (a.name || "").localeCompare((b.name || ""), "ko"); }).forEach(function (s) {
        var isOpen = !!studentDbExpandedIds[s.id];
        var coursePills = STUDENT_DB_COURSE_KEYS.filter(function (k) { return s.courses && s.courses[k]; })
          .map(function (k) { return pill(STUDENT_DB_COURSE_LABELS[k], STUDENT_DB_COURSE_PILL[k]); }).join(" ");
        html += "<tr>";
        html += '<td><button class="icon-btn" data-studentdb-toggle="' + s.id + '" aria-label="상세 보기·수정" style="color:var(--brand)">' + (isOpen ? "▾" : "▸") + "</button></td>";
        if ((s.name || "").trim()) html += "<td><b>" + esc(dupNames[s.id] || s.name) + "</b></td>";
        else html += '<td><span class="db-nameless">' + esc(dbDisplayName(s)) + '</span><input type="text" class="inline-select db-name-fill" data-inline-text="name" data-id="' + s.id + '" data-entity="studentDb" placeholder="이름 알게 되면 입력 → Enter" value=""></td>';
        html += '<td class="col-mobile-hide">' + esc(s.phone || "-") + "</td>";
        html += '<td class="col-mobile-hide">' + (s.registeredDate ? formatShortDate(s.registeredDate) : "-") + "</td>";
        html += "<td>" + (coursePills || "-") + "</td>";
        html += "<td>" + (s.linkedStudentId
          ? pill("🔗 매출등록됨", "good") + ' <button type="button" class="btn btn-ghost btn-sm" data-studentdb-unlink="' + s.id + '">해제</button>'
          : '<button type="button" class="btn btn-ghost btn-sm" data-studentdb-link="' + s.id + '">+ 매출 등록</button>') +
          ' <button type="button" class="btn btn-ghost btn-sm" data-wizard-from-db="' + s.id + '" title="반·수강료·입금 연결을 마법사로 진행">🧭 마법사</button></td>';
        html += '<td><div class="row-actions"><button class="icon-btn" data-del="studentDb" data-id="' + s.id + '" aria-label="삭제">✕</button></div></td>';
        html += "</tr>";
        if (isOpen) {
          html += '<tr><td colspan="' + COLSPAN + '"><div style="padding:14px;background:var(--surface-2);border:1px solid var(--border);border-radius:8px;display:flex;flex-wrap:wrap;gap:10px">';
          html += field("이름", '<input type="text" class="inline-select" data-inline-text="name" data-id="' + s.id + '" data-entity="studentDb" value="' + esc(s.name || "") + '">');
          html += field("연락처", '<input type="text" class="inline-select" data-inline-text="phone" data-phone-input data-id="' + s.id + '" data-entity="studentDb" value="' + esc(s.phone || "") + '" placeholder="010-0000-0000">');
          html += field("수강과정", STUDENT_DB_COURSE_KEYS.map(function (k) {
            return '<label style="display:inline-flex;align-items:center;gap:4px;margin-right:12px;font-weight:400"><input type="checkbox" data-studentdb-course-toggle="' + k + '" data-id="' + s.id + '" ' + (s.courses && s.courses[k] ? "checked" : "") + "> " + STUDENT_DB_COURSE_LABELS[k] + "</label>";
          }).join(""), "grow");
          html += field("등록일", '<input type="date" class="inline-select" data-inline-date="registeredDate" data-id="' + s.id + '" data-entity="studentDb" value="' + esc(s.registeredDate || "") + '">');
          html += field("입금일", '<input type="date" class="inline-select" data-inline-date="paymentDate" data-id="' + s.id + '" data-entity="studentDb" value="' + esc(s.paymentDate || "") + '">');
          html += field("금액(원)", '<input type="number" class="inline-select" min="0" step="10000" data-inline-number="amount" data-id="' + s.id + '" data-entity="studentDb" value="' + (s.amount || 0) + '">');
          html += field("수강형태", studentDbSelectHtml("courseType", STUDENT_DB_COURSE_TYPE_OPTIONS, s.courseType, s.id));
          html += field("수업시간", studentDbSelectHtml("classTime", STUDENT_DB_CLASS_TIME_OPTIONS, s.classTime, s.id));
          html += field("입금상태", studentDbSelectHtml("paymentStatus", STUDENT_DB_PAYMENT_STATUS_OPTIONS, s.paymentStatus, s.id));
          html += field("메모", '<input type="text" class="inline-select" data-inline-text="memo" data-id="' + s.id + '" data-entity="studentDb" value="' + esc(s.memo || "") + '">', "grow");
          html += "</div></td></tr>";
        }
      });
    }
    html += "</tbody></table></div>";

    document.getElementById("main").innerHTML = html;
    bindWizard();

    document.getElementById("studentDbForm").addEventListener("keydown", function (e) {
      // 한글 등 조합형 입력 중에 IME가 Enter로 글자를 확정지으면, 그 Enter가 그대로
      // 폼 제출까지 이어져서 이름을 다 입력하기도 전에 등록돼버리는 문제를 막는다.
      if (e.key === "Enter" && e.isComposing) { e.preventDefault(); }
    });
    document.getElementById("studentDbForm").addEventListener("submit", function (e) {
      e.preventDefault();
      var fd = new FormData(e.target);
      var name = (fd.get("name") || "").toString().trim();
      if (!name) { toast("이름을 입력해주세요."); return; }
      var courses = {};
      STUDENT_DB_COURSE_KEYS.forEach(function (k) { courses[k] = fd.get("course_" + k) === "on"; });
      var addEntry = function () {
        state.studentDb.push({
          id: uid(), name: name, phone: (fd.get("phone") || "").toString().trim() || null,
          registeredDate: fd.get("registeredDate") || null, courses: courses,
          amount: Number(fd.get("amount")) || null, courseType: (fd.get("courseType") || "").toString().trim() || null,
          classTime: (fd.get("classTime") || "").toString().trim() || null,
          paymentStatus: (fd.get("paymentStatus") || "").toString().trim() || null,
          paymentDate: fd.get("paymentDate") || null,
          cashReceipt: null, memo: (fd.get("memo") || "").toString().trim() || null
        });
        saveState(); toast("수강생이 추가되었습니다."); render();
      };
      var dup = findStudentDbByName(name);
      if (dup) {
        customConfirm(name + "님은 이미 수강생 DB에 등록되어 있습니다" + (dup.registeredDate ? " (등록일 " + formatShortDate(dup.registeredDate) + ")" : "") + ".\n동명이인이 맞으면 계속 진행하고, 같은 사람이면 취소 후 기존 항목을 사용해주세요.\n\n그래도 새로 등록하시겠습니까?", addEntry);
      } else {
        addEntry();
      }
    });

    Array.prototype.forEach.call(document.querySelectorAll("[data-studentdb-course-filter]"), function (btn) {
      btn.addEventListener("click", function () { studentDbFilterCourse = btn.getAttribute("data-studentdb-course-filter"); render(); });
    });
    Array.prototype.forEach.call(document.querySelectorAll("[data-studentdb-month-select]"), function (el) {
      el.addEventListener("click", function () { studentDbFilterMonth = el.getAttribute("data-studentdb-month-select"); render(); });
    });
    Array.prototype.forEach.call(document.querySelectorAll("[data-studentdb-toggle]"), function (btn) {
      btn.addEventListener("click", function () {
        var id = btn.getAttribute("data-studentdb-toggle");
        studentDbExpandedIds[id] = !studentDbExpandedIds[id];
        render();
      });
    });
    Array.prototype.forEach.call(document.querySelectorAll("[data-studentdb-course-toggle]"), function (cb) {
      cb.addEventListener("change", function () {
        var item = state.studentDb.find(function (x) { return x.id === cb.getAttribute("data-id"); });
        if (!item) return;
        item.courses = item.courses || {};
        item.courses[cb.getAttribute("data-studentdb-course-toggle")] = cb.checked;
        saveState(); render();
      });
    });
    Array.prototype.forEach.call(document.querySelectorAll("[data-studentdb-link]"), function (btn) {
      btn.addEventListener("click", function () {
        linkStudentDbToRevenue(btn.getAttribute("data-studentdb-link"));
        saveState(); toast("수강생 · 매출 실적에 등록되었습니다."); render();
      });
    });
    Array.prototype.forEach.call(document.querySelectorAll("[data-wizard-from-db]"), function (btn) {
      btn.addEventListener("click", function () {
        if (!wizardPrefillFromDb(btn.getAttribute("data-wizard-from-db"))) return;
        wizardOpen = true; wizardStep = 2;
        render();
        var card = document.querySelector(".wizard-card");
        if (card && card.scrollIntoView) card.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    });
    Array.prototype.forEach.call(document.querySelectorAll("[data-studentdb-unlink]"), function (btn) {
      btn.addEventListener("click", function () {
        var sdbId = btn.getAttribute("data-studentdb-unlink");
        customConfirm("매출연동을 해제하시겠습니까? 연동된 수강생 · 매출 실적 데이터도 함께 삭제됩니다.", function () {
          unlinkStudentDbFromRevenue(sdbId);
          saveState(); toast("매출연동을 해제했습니다."); render();
        });
      });
    });
    var searchEl = document.getElementById("studentDbSearchInput");
    if (searchEl) {
      var studentDbSearchComposing = false;
      var studentDbSearchDebounceTimer = null;
      var runStudentDbSearch = function () {
        studentDbSearchQuery = searchEl.value;
        var cursorPos = searchEl.selectionStart;
        render();
        var newSearchEl = document.getElementById("studentDbSearchInput");
        if (newSearchEl) { newSearchEl.focus(); newSearchEl.setSelectionRange(cursorPos, cursorPos); }
      };
      var scheduleStudentDbSearch = function () {
        if (studentDbSearchDebounceTimer) clearTimeout(studentDbSearchDebounceTimer);
        studentDbSearchDebounceTimer = setTimeout(runStudentDbSearch, 250);
      };
      searchEl.addEventListener("compositionstart", function () {
        studentDbSearchComposing = true;
        if (studentDbSearchDebounceTimer) { clearTimeout(studentDbSearchDebounceTimer); studentDbSearchDebounceTimer = null; }
      });
      searchEl.addEventListener("compositionend", function () { studentDbSearchComposing = false; scheduleStudentDbSearch(); });
      searchEl.addEventListener("input", function (e) {
        if (studentDbSearchComposing || (e && e.isComposing)) return;
        scheduleStudentDbSearch();
      });
    }

    bindTableCommon("studentDb");
    bindPhoneAutoFormat();
  }

  /* ---------------- Loan Consultants DB ---------------- */
  function loanConsultantCopyText(c) {
    var parts = [c.name];
    if (c.org) parts.push(c.org);
    if (c.phone) parts.push(c.phone);
    if (c.region) parts.push(c.region);
    var line = parts.join(" / ");
    if (c.memo) line += " (" + c.memo + ")";
    return line;
  }

  // 대한민국 17개 시·도 + "전국"/"미분류". 상담사가 자유입력한 담당지역 텍스트(예: "대구 수성구",
  // "경기 수원시")를 이 표준 지역군으로 묶어서 필터를 깔끔하게 보여주기 위한 분류기.
  // 저장된 원본 텍스트는 그대로 두고, 필터·정렬·집계에서만 이 분류를 사용한다.
  var REGION_GROUPS = ["서울", "부산", "대구", "인천", "광주", "대전", "울산", "세종", "경기", "강원", "충북", "충남", "전북", "전남", "경북", "경남", "제주"];
  var REGION_GROUP_KEYWORDS = {
    "서울": ["서울", "강남구", "강동구", "강북구", "강서구", "관악구", "광진구", "구로구", "금천구", "노원구", "도봉구", "동대문구", "동작구", "마포구", "서대문구", "서초구", "성동구", "성북구", "송파구", "양천구", "영등포구", "용산구", "은평구", "종로구", "중랑구"],
    "부산": ["부산", "해운대", "사상구", "사하구", "기장군", "동래구", "연제구", "부산진", "금정구", "영도구"],
    "대구": ["대구", "수성구", "달서구", "달성군"],
    "인천": ["인천", "연수구", "남동구", "부평구", "계양구", "미추홀", "강화군", "옹진군"],
    "광주": ["광주광역시", "광산구"],
    "대전": ["대전", "유성구", "대덕구"],
    "울산": ["울산", "울주군"],
    "세종": ["세종"],
    "경기": ["경기", "수원", "성남", "고양", "용인", "부천", "안산", "안양", "남양주", "화성", "평택", "의정부", "시흥", "파주", "김포", "광명", "군포", "이천", "오산", "하남", "양주", "구리", "안성", "포천", "의왕", "여주", "양평", "과천", "가평", "연천"],
    "강원": ["강원", "춘천", "원주", "강릉", "동해", "태백", "속초", "삼척", "홍천", "횡성", "영월", "평창", "정선", "철원", "화천", "양구", "인제", "고성군", "양양"],
    "충북": ["충북", "충청북도", "청주", "충주", "제천", "보은", "옥천", "영동군", "증평", "진천", "괴산", "음성", "단양"],
    "충남": ["충남", "충청남도", "천안", "공주", "보령", "아산", "서산", "논산", "계룡", "당진", "금산", "부여", "서천", "청양", "홍성", "예산", "태안"],
    "전북": ["전북", "전라북도", "전주", "군산", "익산", "정읍", "남원", "김제", "완주", "진안", "무주", "장수군", "임실", "순창", "고창", "부안"],
    "전남": ["전남", "전라남도", "목포", "여수", "순천", "나주", "광양", "담양", "곡성", "구례", "고흥", "보성", "화순", "장흥", "강진", "해남", "영암", "무안", "함평", "영광", "장성", "완도", "진도", "신안"],
    "경북": ["경북", "경상북도", "포항", "경주", "김천", "안동", "구미", "영주", "영천", "상주", "문경", "경산", "군위", "의성", "청송", "영양", "영덕", "청도", "고령", "성주", "칠곡", "예천", "봉화", "울진", "울릉"],
    "경남": ["경남", "경상남도", "창원", "진주", "통영", "사천", "김해", "밀양", "거제", "양산", "의령", "함안", "창녕", "고성군", "남해", "하동", "산청", "함양", "거창", "합천"],
    "제주": ["제주", "서귀포"]
  };
  // 여러 시·도가 공통으로 쓰는 구 이름(중구·동구·서구·남구·북구)이라 시·도명이 안 붙어 있으면
  // 어느 지역인지 애매하다 — 이 사업이 대구 기반이므로 그런 애매한 표기는 대구로 분류한다.
  var REGION_AMBIGUOUS_GU_DEFAULT_TO_DAEGU = ["중구", "동구", "서구", "남구", "북구"];

  // 담당지역 텍스트 하나에 여러 지역 키워드가 같이 들어있을 수 있다(예: "전북 전주 · 전국 상담 가능").
  // "전국"이라는 키워드가 들어있으면 다른 지역이 같이 적혀 있어도 항상 동일하게 "전국"으로도 분류되도록,
  // 첫 매치에서 멈추지 않고 해당되는 지역군을 전부 모아서 반환한다(다중 태그).
  function classifyRegionGroups(raw) {
    var text = (raw || "").trim();
    if (!text) return ["미분류"];
    var tags = [];
    for (var i = 0; i < REGION_GROUPS.length; i++) {
      var kws = REGION_GROUP_KEYWORDS[REGION_GROUPS[i]];
      for (var j = 0; j < kws.length; j++) {
        if (text.indexOf(kws[j]) !== -1) { tags.push(REGION_GROUPS[i]); break; }
      }
    }
    if (!tags.length) {
      for (var k = 0; k < REGION_AMBIGUOUS_GU_DEFAULT_TO_DAEGU.length; k++) {
        if (text.indexOf(REGION_AMBIGUOUS_GU_DEFAULT_TO_DAEGU[k]) !== -1) { tags.push("대구"); break; }
      }
    }
    if (text.indexOf("전국") !== -1 || text.indexOf("전지역") !== -1) {
      if (tags.indexOf("전국") === -1) tags.push("전국");
    }
    if (!tags.length) tags.push("미분류");
    return tags;
  }

  // 정렬 등 대표 지역군 하나만 필요할 때 쓰는 헬퍼(다중 태그 중 첫 번째).
  function classifyRegionGroup(raw) { return classifyRegionGroups(raw)[0]; }

  function loanConsultantRegionGroupOrder() { return REGION_GROUPS.concat(["전국", "미분류"]); }

  function loanConsultantRegionGroupOptions() {
    var order = loanConsultantRegionGroupOrder();
    var counts = {};
    state.loanConsultants.forEach(function (c) {
      classifyRegionGroups(c.region).forEach(function (g) { counts[g] = (counts[g] || 0) + 1; });
    });
    return order.filter(function (g) { return counts[g] > 0; }).map(function (g) { return { group: g, count: counts[g] }; });
  }

  function normalizePhone(p) { return (p || "").replace(/[^0-9]/g, ""); }

  function sortLoanConsultants(list, key) {
    var sorted = list.slice();
    var order = loanConsultantRegionGroupOrder();
    if (key === "recent") {
      sorted.sort(function (a, b) { return (b.createdAt || "").localeCompare(a.createdAt || ""); });
    } else if (key === "region") {
      sorted.sort(function (a, b) {
        var r = order.indexOf(classifyRegionGroup(a.region)) - order.indexOf(classifyRegionGroup(b.region));
        return r !== 0 ? r : (a.name || "").localeCompare(b.name || "", "ko");
      });
    } else {
      sorted.sort(function (a, b) { return (a.name || "").localeCompare(b.name || "", "ko"); });
    }
    return sorted;
  }

  function renderLoanConsultants() {
    var regionGroups = loanConsultantRegionGroupOptions();
    var q = loanConsultantSearchQuery.trim().toLowerCase();
    var filtered = state.loanConsultants.filter(function (c) {
      if (loanConsultantFilterRegion !== "all" && classifyRegionGroups(c.region).indexOf(loanConsultantFilterRegion) === -1) return false;
      if (q && ![c.name, c.org, c.phone, c.region, c.memo].some(function (v) { return (v || "").toLowerCase().indexOf(q) !== -1; })) return false;
      return true;
    });
    var sorted = sortLoanConsultants(filtered, loanConsultantSortKey);

    var html = "";
    html += '<div class="page-head"><div><h1>대출상담사 DB</h1><div class="sub">거래하는 대출상담사 연락처를 등록해두고 언제든 조회 · 복사할 수 있습니다.</div></div></div>';

    html += '<div class="kpi-grid cols-4">';
    html += kpiCard("전체 등록", state.loanConsultants.length, "명");
    html += kpiCard("담당 지역군", regionGroups.length, "곳");
    html += kpiCard("검색결과", sorted.length, "명");
    html += kpiCard("연락처 미등록", state.loanConsultants.filter(function (c) { return !c.phone; }).length, "명");
    html += "</div>";

    html += '<form class="add-form" id="loanConsultantForm">';
    html += field("이름", '<input type="text" name="name" placeholder="예: 김상담" required>');
    html += field("소속", '<input type="text" name="org" placeholder="예: ○○은행 △△지점">');
    html += field("연락처", '<input type="text" name="phone" data-phone-input placeholder="010-0000-0000">');
    html += field("담당지역", '<input type="text" name="region" placeholder="예: 대구 전지역">');
    html += field("메모", '<input type="text" name="memo" placeholder="특이사항">', "grow");
    html += '<button type="submit" class="btn btn-primary">+ 상담사 추가</button>';
    html += "</form>";

    html += '<div class="card" style="margin-bottom:18px;">';
    html += '<h3>여러 명 한번에 등록</h3>';
    html += '<div class="mapping-hint">엑셀/구글시트에서 이름·소속·연락처·담당지역·메모 순서로 여러 행을 복사해 아래에 붙여넣으세요. 한 줄에 한 명, 탭 또는 쉼표로 구분됩니다. 이미 등록된 연락처와 같은 번호는 자동으로 건너뜁니다.</div>';
    html += '<textarea id="loanConsultantBulkInput" rows="4" style="width:100%;background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:10px 12px;" placeholder="김상담	○○은행 △△지점	010-1234-5678	대구 전지역	경매낙찰자 우대"></textarea>';
    html += '<div style="margin-top:10px;"><button class="btn btn-primary btn-sm" id="loanConsultantBulkBtn">일괄 등록</button></div>';
    html += "</div>";

    html += '<div class="filter-bar">';
    html += '<input type="text" id="loanConsultantSearchInput" class="inline-select" placeholder="🔍 이름·소속·연락처·지역 검색" value="' + esc(loanConsultantSearchQuery) + '" style="min-width:220px;flex:1">';
    if (regionGroups.length) {
      html += '<select class="inline-select" id="loanConsultantRegionFilter">';
      html += '<option value="all"' + (loanConsultantFilterRegion === "all" ? " selected" : "") + ">전체 지역</option>";
      regionGroups.forEach(function (g) {
        html += '<option value="' + esc(g.group) + '"' + (loanConsultantFilterRegion === g.group ? " selected" : "") + ">" + esc(g.group) + " (" + g.count + ")</option>";
      });
      html += "</select>";
    }
    html += '<select class="inline-select" id="loanConsultantSortSelect">';
    html += '<option value="name"' + (loanConsultantSortKey === "name" ? " selected" : "") + ">정렬: 이름순</option>";
    html += '<option value="recent"' + (loanConsultantSortKey === "recent" ? " selected" : "") + ">정렬: 최근등록순</option>";
    html += '<option value="region"' + (loanConsultantSortKey === "region" ? " selected" : "") + ">정렬: 지역순</option>";
    html += "</select>";
    html += '<button class="btn btn-ghost btn-sm" id="loanConsultantCopyAllBtn">전체 복사</button>';
    html += "</div>";

    var LC_COLSPAN = 6;
    html += '<div class="table-wrap"><table class="data-table"><thead><tr><th>이름</th><th>소속</th><th>연락처</th><th>담당지역</th><th>메모</th><th></th></tr></thead><tbody>';
    if (!sorted.length) {
      html += '<tr><td colspan="' + LC_COLSPAN + '"><div class="empty-state">' + (state.loanConsultants.length ? "검색·필터 조건에 맞는 상담사가 없습니다." : "등록된 대출상담사가 없습니다.") + "</div></td></tr>";
    } else {
      sorted.forEach(function (c) {
        var isOpen = !!loanConsultantExpandedIds[c.id];
        html += "<tr>";
        html += "<td><b>" + esc(c.name || "-") + "</b></td>";
        html += "<td>" + esc(c.org || "-") + "</td>";
        html += "<td>" + esc(c.phone || "-") + "</td>";
        html += "<td>" + (c.region ? pill(c.region, "neutral") : "-") + "</td>";
        html += '<td class="memo-cell">' + esc(c.memo || "-") + "</td>";
        html += '<td><div class="row-actions">' +
          (c.phone ? '<a class="icon-btn" href="tel:' + esc(normalizePhone(c.phone)) + '" aria-label="전화 걸기" title="전화 걸기">📞</a>' : "") +
          '<button class="icon-btn" data-copy-loanconsultant="' + c.id + '" aria-label="복사" title="복사">⧉</button>' +
          '<button class="icon-btn" data-loanconsultant-toggle="' + c.id + '" aria-label="수정" title="수정" style="' + (isOpen ? "color:var(--brand)" : "") + '">' + (isOpen ? "▾ 완료" : "✏️ 수정") + '</button>' +
          '<button class="icon-btn" data-del="loanConsultant" data-id="' + c.id + '" aria-label="삭제">✕</button></div></td>';
        html += "</tr>";
        if (isOpen) {
          html += '<tr><td colspan="' + LC_COLSPAN + '"><div style="padding:14px;background:var(--surface-2);border:1px solid var(--border);border-radius:8px;display:flex;flex-wrap:wrap;gap:10px">';
          html += field("이름", '<input type="text" class="inline-select" data-inline-text="name" data-id="' + c.id + '" data-entity="loanConsultant" value="' + esc(c.name || "") + '">');
          html += field("소속", '<input type="text" class="inline-select" data-inline-text="org" data-id="' + c.id + '" data-entity="loanConsultant" value="' + esc(c.org || "") + '">');
          html += field("연락처", '<input type="text" class="inline-select" data-inline-text="phone" data-phone-input data-id="' + c.id + '" data-entity="loanConsultant" value="' + esc(c.phone || "") + '" placeholder="010-0000-0000">');
          html += field("담당지역", '<input type="text" class="inline-select" data-inline-text="region" data-id="' + c.id + '" data-entity="loanConsultant" value="' + esc(c.region || "") + '">');
          html += field("메모", '<input type="text" class="inline-select" data-inline-text="memo" data-id="' + c.id + '" data-entity="loanConsultant" value="' + esc(c.memo || "") + '">', "grow");
          html += "</div></td></tr>";
        }
      });
    }
    html += "</tbody></table></div>";

    document.getElementById("main").innerHTML = html;

    document.getElementById("loanConsultantForm").addEventListener("submit", function (e) {
      e.preventDefault();
      var fd = new FormData(e.target);
      var name = (fd.get("name") || "").toString().trim();
      if (!name) return;
      var phone = (fd.get("phone") || "").toString().trim();
      if (phone && normalizePhone(phone)) {
        var dupPhone = normalizePhone(phone);
        var existing = state.loanConsultants.find(function (c) { return normalizePhone(c.phone) === dupPhone; });
        if (existing) { toast("이미 등록된 연락처입니다 (" + existing.name + ")."); return; }
      }
      state.loanConsultants.push({
        id: uid(), name: name, org: (fd.get("org") || "").toString().trim(),
        phone: phone, region: (fd.get("region") || "").toString().trim(),
        memo: (fd.get("memo") || "").toString().trim(), createdAt: new Date().toISOString()
      });
      saveState(); toast("상담사가 추가되었습니다."); render();
    });

    document.getElementById("loanConsultantBulkBtn").addEventListener("click", function () {
      var raw = document.getElementById("loanConsultantBulkInput").value;
      var lines = raw.split(/\r?\n/).map(function (l) { return l.trim(); }).filter(Boolean);
      var existingPhones = {};
      state.loanConsultants.forEach(function (c) { if (c.phone) existingPhones[normalizePhone(c.phone)] = true; });
      var added = 0, skipped = 0;
      lines.forEach(function (line) {
        var cols = (line.indexOf("\t") !== -1 ? line.split("\t") : line.split(",")).map(function (c) { return c.trim(); });
        var name = cols[0] || "";
        if (!name) return;
        var phone = cols[2] || "";
        var normPhone = normalizePhone(phone);
        if (normPhone && existingPhones[normPhone]) { skipped++; return; }
        if (normPhone) existingPhones[normPhone] = true;
        state.loanConsultants.push({
          id: uid(), name: name, org: cols[1] || "", phone: phone, region: cols[3] || "", memo: cols[4] || "",
          createdAt: new Date().toISOString()
        });
        added++;
      });
      if (!added && !skipped) { toast("등록할 내용이 없습니다."); return; }
      saveState();
      toast(added + "명 일괄 등록되었습니다." + (skipped ? " (중복 연락처 " + skipped + "명 제외)" : ""));
      render();
    });

    document.getElementById("loanConsultantCopyAllBtn").addEventListener("click", function () {
      if (!sorted.length) { toast("복사할 내용이 없습니다."); return; }
      copyToClipboard(sorted.map(loanConsultantCopyText).join("\n"), "전체 " + sorted.length + "명 복사되었습니다.");
    });

    Array.prototype.forEach.call(document.querySelectorAll("[data-copy-loanconsultant]"), function (btn) {
      btn.addEventListener("click", function () {
        var c = state.loanConsultants.find(function (x) { return x.id === btn.getAttribute("data-copy-loanconsultant"); });
        if (!c) return;
        copyToClipboard(loanConsultantCopyText(c), "복사되었습니다.");
      });
    });

    Array.prototype.forEach.call(document.querySelectorAll("[data-loanconsultant-toggle]"), function (btn) {
      btn.addEventListener("click", function () {
        var id = btn.getAttribute("data-loanconsultant-toggle");
        loanConsultantExpandedIds[id] = !loanConsultantExpandedIds[id];
        render();
      });
    });

    var regionFilterEl = document.getElementById("loanConsultantRegionFilter");
    if (regionFilterEl) {
      regionFilterEl.addEventListener("change", function () { loanConsultantFilterRegion = regionFilterEl.value; render(); });
    }
    var sortSelectEl = document.getElementById("loanConsultantSortSelect");
    if (sortSelectEl) {
      sortSelectEl.addEventListener("change", function () { loanConsultantSortKey = sortSelectEl.value; render(); });
    }

    var searchEl = document.getElementById("loanConsultantSearchInput");
    if (searchEl) {
      var loanConsultantSearchComposing = false;
      var loanConsultantSearchDebounceTimer = null;
      var runLoanConsultantSearch = function () {
        loanConsultantSearchQuery = searchEl.value;
        var cursorPos = searchEl.selectionStart;
        render();
        var newSearchEl = document.getElementById("loanConsultantSearchInput");
        if (newSearchEl) { newSearchEl.focus(); newSearchEl.setSelectionRange(cursorPos, cursorPos); }
      };
      var scheduleLoanConsultantSearch = function () {
        if (loanConsultantSearchDebounceTimer) clearTimeout(loanConsultantSearchDebounceTimer);
        loanConsultantSearchDebounceTimer = setTimeout(runLoanConsultantSearch, 250);
      };
      searchEl.addEventListener("compositionstart", function () {
        loanConsultantSearchComposing = true;
        if (loanConsultantSearchDebounceTimer) { clearTimeout(loanConsultantSearchDebounceTimer); loanConsultantSearchDebounceTimer = null; }
      });
      searchEl.addEventListener("compositionend", function () { loanConsultantSearchComposing = false; scheduleLoanConsultantSearch(); });
      searchEl.addEventListener("input", function (e) {
        if (loanConsultantSearchComposing || (e && e.isComposing)) return;
        scheduleLoanConsultantSearch();
      });
    }

    bindTableCommon("loanConsultant");
    bindPhoneAutoFormat();
  }

  /* ---------------- 효제이 AI직원팀 (시장조사·콘텐츠아이디어·검수함·승인함·블로그 통합) ---------------- */

  // ───────── AI 직원 근무일지 (누가 · 언제 · 무엇을 했는지 한눈에) ─────────
  // 블로그 stageLog, 자동화 실행 기록, 브랜드전략·캐러셀·시장조사·콘텐츠 기록, 클라우드 반영 이벤트를
  // 한 줄기 타임라인으로 합치고, 담당별로 오늘/이번 주 활동을 센다. 스킬 파일의 역할 이름과 맞춘다.
  var AI_WORK_ROSTER = [
    { id: "research", icon: "🔎", name: "시장조사 담당", shift: "매일 08:00", skill: "blog-idea-scout", role: "블로그 소재 발굴 · 지역 시황 리서치", duty: "최근 3~4일 뉴스·정책·시황·입찰 팁을 조사해 오늘의 소재 후보를 만듭니다. 출처 URL이 없는 아이디어는 만들지 않습니다." },
    { id: "content", icon: "💡", name: "콘텐츠기획 담당", shift: "매일 08:00", skill: "blog-fact-checker", role: "사실관계 검증 · 콘텐츠 기획", duty: "소재에 담긴 통계·수치를 출처 원문과 대조합니다. 원문에서 확인 안 되면 통과시키지 않고 보류로 넘깁니다." },
    { id: "blog", icon: "📝", name: "블로그제작 담당", shift: "매일 08:00", skill: "blog-writer", role: "블로그 본문 작성", duty: "검증을 통과한 소재로 1,500자 이상 본문을 씁니다. 경매 물건 글은 권리분석 규칙을 따로 적용합니다." },
    { id: "review", icon: "🕵️", name: "검수 담당", shift: "매일 08:00", skill: "blog-seo-editor", role: "SEO · 형식 검수", duty: "제목 길이, 키워드, 메타디스크립션, 소제목, 해시태그, 분량을 점검해 발행대기로 올립니다." },
    { id: "approval", icon: "✅", name: "승인 담당", shift: "매일 08:00", skill: "blog-final-reviewer", role: "최종검토 · 보류 판정", duty: "기준 미달 항목을 보류로 확정하고 사유를 남깁니다. 통과 항목은 대리님 검토용으로 넘깁니다." },
    { id: "carousel", icon: "🎨", name: "이미지구성팀 담당", shift: "승인 시 수시", skill: "image-carousel-designer", role: "인스타그램 캐러셀 제작", duty: "승인된 콘텐츠 기획 항목을 스와이프 카드 초안으로 만듭니다." },
    { id: "brand", icon: "🧭", name: "브랜드전략 담당", shift: "매주", skill: "brand-strategy-analyst", role: "경쟁사 조사 · 차별화 도출", duty: "대구 경쟁 경매교육 업체의 수강료·과정·채널·광고문구를 비교해 우리 강점 소재를 뽑습니다." },
    { id: "ops", icon: "🤖", name: "운영 비서", shift: "매일 07:00 · 수시", skill: "경매 결과 동기화 · 발행 확인 · 데이터 반영", role: "대시보드 운영 자동화", duty: "매각 결과를 현황판과 대조해 자동 반영하고, 네이버 게시 여부를 확인하며, 대리님이 보낸 입금·수강생 자료를 등록합니다." },
    { id: "user", icon: "👤", name: "안효준 대리", shift: "상시", skill: "최종 결정", role: "대표 · 최종 의사결정", duty: "AI가 만든 것을 검토하고 실제 게시·입찰·등록을 결정합니다. 최종 판단은 사람이 합니다." }
  ];
  var aiLogFilter = "all";
  var aiLogShowAll = false;
  function aiMemberFromStage(stage, by) {
    var hay = (stage || "") + " " + (by || "");
    if (/안효준|대리님/.test(hay)) return "user";
    if (/정보검수|콘텐츠기획/.test(hay)) return "content";
    if (/아이디어|시장조사/.test(hay)) return "research";
    if (/SEO|검수담당|검수 담당|검수·발행/.test(hay)) return "review";
    if (/최종검토|최종승인|승인|보류/.test(hay)) return "approval";
    if (/작성|블로그제작/.test(hay)) return "blog";
    if (/발행완료|발행/.test(hay)) return "user";
    return "ops";
  }
  function aiWorkLogEvents() {
    var ev = [];
    state.blogPosts.forEach(function (p) {
      (p.stageLog || []).forEach(function (l) {
        if (!l || !l.at) return;
        ev.push({ at: l.at, who: aiMemberFromStage(l.stage, l.by), stage: l.stage || "", title: p.title || "", note: l.note || "", pid: p.id });
      });
    });
    (state.blogAutomationLog || []).forEach(function (r) {
      if (!r || !r.runAt) return;
      var txt = r.status === "no_new" ? "새 소재 없음 · 생산 보류" : (r.status === "error" ? "실행 오류" : "블로그 " + (r.addedCount || 0) + "건 처리");
      ev.push({ at: r.runAt, who: "approval", stage: "파이프라인 실행", title: txt, note: r.note || "" });
    });
    (state.brandStrategyReports || []).forEach(function (b) { if (b && b.createdAt) ev.push({ at: b.createdAt, who: "brand", stage: "경쟁사 분석", title: (b.weekOf ? b.weekOf + " 주" : "") + " 브랜드전략 보고서", note: (Array.isArray(b.differentiationIdeas) ? b.differentiationIdeas.slice(0, 2).map(function (x) { return typeof x === "string" ? x : (x && (x.title || x.idea || x.text)) || ""; }).join(" · ") : String(b.differentiationIdeas || "").slice(0, 80)) }); });
    (state.carouselDrafts || []).forEach(function (c) { if (c && c.createdAt) ev.push({ at: c.createdAt, who: "carousel", stage: "캐러셀 초안", title: c.title || "", note: (c.slideCount ? c.slideCount + "장" : "") }); });
    (state.marketResearch || []).forEach(function (r) { if (r && r.createdAt) ev.push({ at: r.createdAt, who: "research", stage: "시장조사", title: [r.region, r.topic].filter(Boolean).join(" · "), note: r.status || "" }); });
    (state.contentIdeas || []).forEach(function (c) { if (c && c.createdAt) ev.push({ at: c.createdAt, who: "content", stage: "콘텐츠 아이디어", title: c.title || "", note: c.status || "" }); });
    (state.meta.syncEvents || []).forEach(function (e) { if (e && e.at) ev.push({ at: e.at, who: "ops", stage: "데이터 반영", title: e.message || "", note: "" }); });
    (state.routineRuns || []).forEach(function (r) {
      if (!r || !r.at) return;
      var j = ROUTINE_JOBS.find(function (x) { return x.key === r.job; });
      ev.push({ at: r.at, who: (j && j.who) || "ops", stage: (j && j.name) || "루틴", title: r.summary || "", note: r.detail || "" });
    });
    ev.sort(function (a, b) { return a.at < b.at ? 1 : -1; });
    return ev;
  }
  function timeAgo(iso) {
    var t = new Date(iso).getTime(); if (!t) return "";
    var d = Math.round((Date.now() - t) / 60000);
    if (d < 1) return "방금";
    if (d < 60) return d + "분 전";
    if (d < 60 * 24) return Math.round(d / 60) + "시간 전";
    return Math.round(d / 1440) + "일 전";
  }
  function fmtClock(iso) {
    var dt = new Date(iso); if (isNaN(dt.getTime())) return "";
    return pad2(dt.getHours()) + ":" + pad2(dt.getMinutes());
  }
  function aiWorkLogHtml(events) {
    var today = todayStr();
    var byPerson = aiLogFilter !== "all" && aiLogFilter !== "today";
    var filtered = aiLogFilter === "all" ? events : aiLogFilter === "today" ? events.filter(function (e) { return e.at.slice(0, 10) === today; }) : events.filter(function (e) { return e.who === aiLogFilter; });

    // 반복 줄이기 ①: 글 하나가 5단계를 지나면 같은 제목이 5줄로 반복되므로 글 단위로 묶는다.
    // 반복 줄이기 ②: 같은 직원이 같은 일(운영 비서 데이터 반영 등)을 하루에 여러 번 하면 한 줄로 합친다.
    var rows = [], idx = {};
    filtered.forEach(function (e) {
      var day = e.at.slice(0, 10);
      if (e.pid && !byPerson) {
        var pk = "p|" + e.pid + "|" + day;
        if (idx[pk]) { idx[pk].steps.push(e); return; }
        idx[pk] = { at: e.at, title: e.title, steps: [e], items: null };
        rows.push(idx[pk]);
        return;
      }
      var sk = "s|" + e.who + "|" + lastStageLabel(e) + "|" + day;
      if (idx[sk]) { idx[sk].items.push(e); return; }
      idx[sk] = { at: e.at, steps: null, items: [e] };
      rows.push(idx[sk]);
    });
    // 3건 미만으로 묶인 것은 원래대로 한 줄씩 펼친다 (내용이 각각 달라서)
    var expanded = [];
    rows.forEach(function (r) {
      if (r.items && r.items.length < 3) r.items.forEach(function (e) { expanded.push({ at: e.at, items: [e] }); });
      else expanded.push(r);
    });
    rows = expanded.sort(function (a, b) { return a.at < b.at ? 1 : -1; });
    // 기본은 가장 최근 하루치만. 나머지는 '더 보기'로 펼친다.
    var latestDay = rows.length ? rows[0].at.slice(0, 10) : "";
    var shown = aiLogShowAll ? rows : rows.filter(function (r) { return r.at.slice(0, 10) === latestDay; });

    var latestDay0 = rows.length ? rows[0].at.slice(0, 10) : "";
    var dayLabel = !latestDay0 ? "" : latestDay0 === today ? "오늘" : latestDay0 === addDaysToDateStr(today, -1) ? "어제" : formatShortDate(latestDay0);
    var html = '<div class="card section-gap"><h3>📜 근무일지 <span class="count">' +
      (aiLogShowAll ? "전체 " + rows.length + "줄 · 활동 " + filtered.length + "건" : esc(dayLabel) + " 기준 · 전체 활동 " + filtered.length + "건") + "</span></h3>";
    html += '<div class="filter-bar">' + [["all", "전체"], ["today", "오늘"]].concat(AI_WORK_ROSTER.map(function (m) { return [m.id, m.icon + " " + m.name]; })).map(function (o) {
      return '<button class="filter-chip" data-ai-log-filter="' + o[0] + '" aria-pressed="' + (aiLogFilter === o[0]) + '">' + esc(o[1]) + "</button>";
    }).join("") + "</div>";
    if (!shown.length) { html += '<div class="empty-state">기록이 없습니다.</div></div>'; return html; }

    var lastDay = null;
    shown.forEach(function (r) {
      var day = r.at.slice(0, 10);
      if (day !== lastDay) {
        var label = day === today ? "오늘" : day === addDaysToDateStr(today, -1) ? "어제" : formatShortDate(day);
        html += '<div class="ai-log-day">' + esc(label) + "</div>";
        lastDay = day;
      }
      if (r.items) {
        var e = r.items[0];
        var m = AI_WORK_ROSTER.find(function (x) { return x.id === e.who; });
        var many = r.items.length > 1;
        html += '<div class="ai-log-row"><span class="ai-log-time">' + fmtClock(e.at) + '</span><span class="ai-log-icon">' + (m ? m.icon : "🤖") + '</span><div class="ai-log-body">';
        html += '<div class="ai-log-title"><b>' + esc(m ? m.name : "운영 비서") + "</b> · " + esc(lastStageLabel(e)) +
          (many ? ' <span class="log-count">' + r.items.length + "건</span>" : (e.title ? " · " + esc(e.title.slice(0, 60)) : "")) + "</div>";
        if (many) {
          html += '<div class="ai-log-note">' + r.items.slice(0, 3).map(function (x) { return esc((x.title || x.note || "").slice(0, 44)); }).filter(Boolean).join(" · ") +
            (r.items.length > 3 ? " · 외 " + (r.items.length - 3) + "건" : "") + "</div>";
        } else if (e.note) {
          html += '<div class="ai-log-note">' + esc(e.note.slice(0, 140)) + "</div>";
        }
        html += "</div></div>";
        return;
      }
      var steps = r.steps.slice().sort(function (a, b) { return (a.at === b.at ? stageRank(a) - stageRank(b) : (a.at < b.at ? -1 : 1)); });
      var last = steps[steps.length - 1];
      html += '<div class="ai-log-row"><span class="ai-log-time">' + fmtClock(last.at) + '</span><span class="ai-log-icon">📄</span><div class="ai-log-body">';
      html += '<div class="ai-log-title"><b>' + esc((r.title || "제목 없음").slice(0, 60)) + "</b></div>";
      html += '<div class="ai-log-steps">' + steps.map(function (st) {
        var mm = AI_WORK_ROSTER.find(function (x) { return x.id === st.who; });
        return '<span class="log-step">' + (mm ? mm.icon : "🤖") + " " + esc(lastStageLabel(st)) + "</span>";
      }).join('<i class="log-arrow">›</i>') + "</div>";
      // 통과한 글은 단계 칩만으로 충분하다. 보류·오류처럼 대리님이 봐야 하는 건만 사유를 적는다.
      var flagged = steps.some(function (st) { return /보류|오류|실패|재작성/.test(lastStageLabel(st) + " " + (st.note || "")); });
      if (flagged && last.note) html += '<div class="ai-log-note flag">' + esc(last.note.slice(0, 130)) + "</div>";
      html += "</div></div>";
    });
    if (rows.length > shown.length || aiLogShowAll) {
      html += '<div class="log-more"><button class="btn btn-ghost btn-sm" id="aiLogMoreBtn">' +
        (aiLogShowAll ? "접기 (" + esc(dayLabel) + "만 보기)" : "이전 기록 더 보기 (" + (rows.length - shown.length) + "줄)") + "</button></div>";
    }
    html += "</div>";
    return html;
  }
  function bindAiWorkLog() {
    Array.prototype.forEach.call(document.querySelectorAll("[data-ai-log-filter]"), function (btn) {
      btn.addEventListener("click", function () { aiLogFilter = btn.getAttribute("data-ai-log-filter"); aiLogShowAll = false; render(); });
    });
    var more = document.getElementById("aiLogMoreBtn");
    if (more) more.addEventListener("click", function () { aiLogShowAll = !aiLogShowAll; render(); });
  }


  // ───────── 사무실 타일 격자 지도 ─────────
  // 방 12개(부서 8 + 대표실 + 회의실 + 라운지 + 출입구)를 좌표로 정의하고 격자를 생성한다.
  // 타일: '#' 벽, '.' 바닥, 'D' 문, 'T' 책상(통행 불가), 'C' 자리(직원이 앉는 칸, 통행 가능), 'M' 회의 탁자,
  //       'S' 소파, 'P' 화분, 'B' 책장, 'K' 커피머신, 'E' 출입구. 통행 가능 = '.', 'D', 'C', 'E'.
  var OFFICE_W = 46, OFFICE_H = 28;
  // 배치는 프로토타입(aioffice)과 같은 순서로 둔다 — 맨 윗줄이 대표실·회의실·라운지,
  // 그 아래 두 줄이 팀실 여덟이다. 복도는 y=8~9, y=18~19 두 줄이고 출입구는 오른쪽 아래 복도 끝.
  var OFFICE_ROOMS = [
    { id: "ceo", name: "대표실", icon: "👤", x: 0, y: 0, w: 13, h: 8, door: "bottom", seats: 1, kind: "ceo" },
    { id: "meeting", name: "대표 승인 회의실", icon: "🗣", x: 13, y: 0, w: 16, h: 8, door: "bottom", seats: 0, kind: "meeting" },
    { id: "lounge", name: "AI 라운지", icon: "☕", x: 29, y: 0, w: 17, h: 8, door: "bottom", seats: 0, kind: "lounge" },
    { id: "research", name: "시장조사실", icon: "🔎", x: 0, y: 10, w: 11, h: 8, door: "top", seats: 1 },
    { id: "content", name: "콘텐츠기획실", icon: "💡", x: 11, y: 10, w: 11, h: 8, door: "top", seats: 1 },
    { id: "blog", name: "블로그제작실", icon: "📝", x: 22, y: 10, w: 11, h: 8, door: "top", seats: 1 },
    { id: "review", name: "검수실", icon: "🕵️", x: 33, y: 10, w: 13, h: 8, door: "top", seats: 1 },
    { id: "approval", name: "승인실", icon: "✅", x: 0, y: 20, w: 11, h: 8, door: "top", seats: 1 },
    { id: "carousel", name: "이미지구성실", icon: "🎨", x: 11, y: 20, w: 11, h: 8, door: "top", seats: 1 },
    { id: "brand", name: "브랜드전략실", icon: "🧭", x: 22, y: 20, w: 11, h: 8, door: "top", seats: 1 },
    { id: "ops", name: "운영비서실", icon: "🤖", x: 33, y: 20, w: 13, h: 8, door: "top", seats: 1 }
  ];
  var OFFICE_ENTRANCE = { x: 45, y: 18 }; // 오른쪽 바깥벽, 아래 복도 끝
  var officeMapCache = null;
  function buildOfficeMap() {
    if (officeMapCache) return officeMapCache;
    var g = [];
    for (var y = 0; y < OFFICE_H; y++) { g.push([]); for (var x = 0; x < OFFICE_W; x++) g[y].push("#"); }
    var set = function (x, y, ch) { if (y >= 0 && y < OFFICE_H && x >= 0 && x < OFFICE_W) g[y][x] = ch; };
    var props = [];
    var box = function (kind, x, y, w, h, extra) {
      var o = { kind: kind, x: x, y: y, w: w, h: h };
      if (extra) Object.keys(extra).forEach(function (k) { o[k] = extra[k]; });
      props.push(o);
      var ch = { desk: "T", ceodesk: "T", table: "M", sofa: "S", plant: "P", shelf: "B", coffee: "K", chair: "C" }[kind];
      if (ch) for (var yy = y; yy < y + h; yy++) for (var xx = x; xx < x + w; xx++) set(xx, yy, ch);
      return o;
    };
    // 복도 두 줄
    for (var cx = 1; cx < OFFICE_W - 1; cx++) { set(cx, 8, "."); set(cx, 9, "."); set(cx, 18, "."); set(cx, 19, "."); }
    var seats = {};
    OFFICE_ROOMS.forEach(function (r) {
      for (var yy = r.y + 1; yy < r.y + r.h - 1; yy++) for (var xx = r.x + 1; xx < r.x + r.w - 1; xx++) set(xx, yy, ".");
      var dx = r.x + Math.floor(r.w / 2), dy = r.door === "bottom" ? r.y + r.h - 1 : r.y;
      set(dx, dy, "D"); r.doorAt = { x: dx, y: dy };
      var cxm = r.x + Math.floor(r.w / 2);
      if (r.kind === "ceo") {
        box("ceodesk", cxm - 1, r.y + 2, 3, 1, { monitor: true });
        box("chair", cxm, r.y + 3, 1, 1); seats[r.id] = [{ x: cxm, y: r.y + 3 }];
        box("sofa", r.x + 2, r.y + 5, 2, 1);
        box("plant", r.x + r.w - 2, r.y + 1, 1, 1);
        box("shelf", r.x + 1, r.y + 1, 2, 1, { label: "결재함" });
      } else if (r.kind === "meeting") {
        box("table", cxm - 3, r.y + 3, 6, 2);
        var chairs = [];
        for (var mx = cxm - 3; mx <= cxm + 2; mx++) { box("chair", mx, r.y + 2, 1, 1); chairs.push({ x: mx, y: r.y + 2 }); box("chair", mx, r.y + 5, 1, 1); chairs.push({ x: mx, y: r.y + 5 }); }
        seats[r.id] = chairs;
        box("plant", r.x + 1, r.y + 1, 1, 1);
        box("shelf", r.x + r.w - 3, r.y + 1, 2, 1, { label: "화이트보드", white: true });
      } else if (r.kind === "lounge") {
        box("sofa", r.x + 2, r.y + 2, 2, 1); box("sofa", r.x + 2, r.y + 5, 2, 1);
        box("coffee", r.x + r.w - 3, r.y + 1, 2, 1, { label: "☕" });
        box("plant", r.x + 1, r.y + 1, 1, 1); box("plant", r.x + r.w - 2, r.y + r.h - 2, 1, 1);
        box("table", cxm, r.y + 3, 2, 1);
        box("chair", cxm - 1, r.y + 3, 1, 1); box("chair", cxm + 2, r.y + 3, 1, 1);
        seats[r.id] = [{ x: cxm - 1, y: r.y + 3 }, { x: cxm + 2, y: r.y + 3 }];
      } else {
        var ty = r.door === "bottom" ? r.y + 2 : r.y + r.h - 3;
        var sy = r.door === "bottom" ? r.y + 3 : r.y + r.h - 4;
        box("desk", cxm - 1, ty, 2, 1, { monitor: true, monitorTop: r.door === "bottom" });
        box("chair", cxm, sy, 1, 1); seats[r.id] = [{ x: cxm, y: sy }];
        var backY = r.door === "bottom" ? r.y + 1 : r.y + r.h - 2;
        box("shelf", r.x + 1, backY, 1, 1);
        box("plant", r.x + r.w - 2, backY, 1, 1);
      }
    });
    // 오른쪽 세로 통로 + 출입구
    for (var vy = 10; vy < 18; vy++) { set(43, vy, "."); set(44, vy, "."); }
    set(OFFICE_ENTRANCE.x, OFFICE_ENTRANCE.y, "E");
    officeMapCache = { grid: g, seats: seats, props: props };
    return officeMapCache;
  }
  function officeWalkable(x, y) {
    var m = buildOfficeMap();
    if (y < 0 || y >= OFFICE_H || x < 0 || x >= OFFICE_W) return false;
    var ch = m.grid[y][x];
    return ch === "." || ch === "D" || ch === "C" || ch === "E";
  }
  function officePath(from, to) {
    // 4방향 BFS. 벽·가구는 못 지나간다. 경로(타일 배열) 또는 null.
    var key = function (p) { return p.x + "," + p.y; };
    var q = [from], prev = {}; prev[key(from)] = null;
    while (q.length) {
      var cur = q.shift();
      if (cur.x === to.x && cur.y === to.y) {
        var path = [], k = key(cur), node = cur;
        while (node) { path.unshift(node); node = prev[key(node)]; }
        return path;
      }
      [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(function (d) {
        var nx = cur.x + d[0], ny = cur.y + d[1], nk = nx + "," + ny;
        if (prev.hasOwnProperty(nk) || !officeWalkable(nx, ny)) return;
        prev[nk] = cur; q.push({ x: nx, y: ny });
      });
    }
    return null;
  }
  function officeSelfCheck() {
    var m = buildOfficeMap(), bad = [];
    OFFICE_ROOMS.forEach(function (r) {
      if (!officePath(OFFICE_ENTRANCE, r.doorAt)) bad.push(r.name + " 문");
      (m.seats[r.id] || []).forEach(function (st, i) { if (!officePath(OFFICE_ENTRANCE, st)) bad.push(r.name + " 자리" + (i + 1)); });
    });
    return bad;
  }
  var officeShowWalk = false;
  function officeRoomStatus(roomId) {
    var def = OFFICE_AGENT_DEFS.find(function (d) { return d.room === roomId; });
    if (!def) return null;
    var ev = aiWorkLogEvents().filter(function (e) { return e.who === def.id; });
    var last = ev[0];
    if (!last) return "waiting";
    var mins = (Date.now() - new Date(last.at).getTime()) / 60000;
    if (mins < 20) return "working";
    return last.at.slice(0, 10) === todayStr() ? "done" : "waiting";
  }
  function officeMapHtml(extra) {
    officeMapOnPage = true;
    var m = buildOfficeMap();
    var bad = officeSelfCheck();
    var totalSeats = 0; OFFICE_ROOMS.forEach(function (r) { totalSeats += (m.seats[r.id] || []).length; });
    var html = '<div class="card section-gap office-card"><h3>🏢 사무실 <span class="count">방 ' + OFFICE_ROOMS.length + " + 출입구 · 자리 " + totalSeats + "개 · 직원 " + OFFICE_AGENT_DEFS.length + "명</span></h3>";
    html += '<div class="office-bar">' + (bad.length ? pill("통행 검증 실패: " + bad.join(", "), "danger") : pill("통행 검증 통과 · 출입구에서 모든 문·자리 도달 가능", "good")) +
      '<button type="button" class="btn btn-ghost btn-sm" id="officeWalkToggle">' + (officeShowWalk ? "통행 표시 끄기" : "통행 가능 칸 표시") + "</button>" + (extra || "") + "</div>";
    html += '<div class="office-wrap"><div class="office-stage" style="width:calc(' + OFFICE_W + ' * var(--tile));height:calc(' + OFFICE_H + ' * var(--tile))">';
    html += '<div class="office-floor"></div>';
    // 방 카드
    OFFICE_ROOMS.forEach(function (r) {
      var st = officeRoomStatus(r.id);
      html += '<div class="rm rm-' + (r.kind || "dept") + (st ? " " + st : "") + '" style="left:calc(' + r.x + ' * var(--tile));top:calc(' + r.y + ' * var(--tile));width:calc(' + r.w + ' * var(--tile));height:calc(' + r.h + ' * var(--tile))">';
      html += '<span class="rm-head"><b>' + r.icon + " " + esc(r.name) + "</b>" + (st ? '<i class="rm-dot ' + st + '" title="' + (st === "working" ? "근무 중" : st === "done" ? "오늘 근무 완료" : "대기") + '"></i>' : "") + "</span>";
      html += '<span class="rm-code">' + esc(r.id) + "</span>";
      html += '<span class="rm-door" style="left:calc(' + (r.doorAt.x - r.x) + ' * var(--tile));top:calc(' + (r.doorAt.y - r.y) + ' * var(--tile) + ' + (r.door === "bottom" ? "var(--tile) - 5px" : "1px") + ')"></span>';
      html += "</div>";
    });
    // 가구
    m.props.forEach(function (pr) {
      html += '<div class="pr pr-' + pr.kind + '" style="left:calc(' + pr.x + ' * var(--tile));top:calc(' + pr.y + ' * var(--tile));width:calc(' + pr.w + ' * var(--tile));height:calc(' + pr.h + ' * var(--tile))">';
      if (pr.monitor) html += '<i class="pr-monitor"></i>';
      if (pr.label) html += "<span>" + esc(pr.label) + "</span>";
      html += "</div>";
    });
    // 매트는 복도 안에만 둔다. 방 배치를 바꾸면서 y-1 로 그리던 윗칸이 검수실 안으로 파고들어
    // 방 이름을 가렸다. 출입구 칸(y)부터 아래 두 칸만 칠한다.
    html += '<div class="entrance-mat" style="left:calc(' + (OFFICE_ENTRANCE.x - 1) + ' * var(--tile));top:calc(' + OFFICE_ENTRANCE.y + ' * var(--tile));width:calc(2 * var(--tile));height:calc(2 * var(--tile))">IN</div>';
    if (officeShowWalk) {
      html += '<div class="office-walk">';
      for (var y = 0; y < OFFICE_H; y++) for (var x = 0; x < OFFICE_W; x++) if (officeWalkable(x, y)) html += '<i style="left:calc(' + x + ' * var(--tile));top:calc(' + y + ' * var(--tile))"></i>';
      html += "</div>";
    }
    html += '<div class="office-agents" id="officeAgents"></div>';
    html += "</div></div>";
    html += "</div>";
    html += officeProfileHtml();
    return html;
  }
  var officeProfileId = null;
  var ceoOrderDraft = "";
  var officeMapOnPage = false;
  var OFFICE_ANIM_LABEL = { walk: "🚶 이동 중", type: "⌨️ 작업 중", talk: "💬 대화 중", sit: "🪑 자리에 앉음", idle: "💤 대기" };
  function officeAnimLabel(st) { return OFFICE_ANIM_LABEL[st] || OFFICE_ANIM_LABEL.idle; }
  function officeSpriteHtml(def, tile) {
    return '<div class="pixel-employee" style="--hair:' + def.hair + ';--shirt:' + def.shirt + ';--accent:' + def.accent + ';--skin:' + def.skin + ';--tile:' + tile + 'px">' +
      '<div class="ag a-idle f-down r-' + def.rank + '" id="officeProfileSprite"><span class="ag-body">' +
        '<i class="p-shadow"></i><i class="p-leg l"></i><i class="p-leg r"></i>' +
        '<i class="p-torso"></i><i class="p-arm l"></i><i class="p-arm r"></i>' +
        '<i class="p-head"><b class="p-eye l"></b><b class="p-eye r"></b></i><i class="p-hair"></i>' +
      "</span></div></div>";
  }
  function officeProfileHtml() {
    if (!officeProfileId) return "";
    var def = OFFICE_AGENT_DEFS.find(function (d) { return d.id === officeProfileId; });
    var info = AI_WORK_ROSTER.find(function (r) { return r.id === officeProfileId; });
    if (!def || !info) return "";
    var events = aiWorkLogEvents().filter(function (e) { return e.who === def.id; });
    var today = todayStr(), wk = weekRange();
    var todayN = events.filter(function (e) { return e.at.slice(0, 10) === today; }).length;
    var weekN = events.filter(function (e) { var d = e.at.slice(0, 10); return d >= wk.start && d <= wk.end; }).length;
    var last = events[0];
    var mins = last ? (Date.now() - new Date(last.at).getTime()) / 60000 : Infinity;
    var stateKey = mins < 20 ? "working" : todayN ? "done" : "waiting";
    var stateLabel = stateKey === "working" ? "근무 중" : stateKey === "done" ? "오늘 근무 완료" : "대기 중";
    var agent = officeMapOnPage && officeSim ? officeSim.agents.find(function (a) { return a.id === def.id; }) : null;
    var animLabel = officeMapOnPage ? officeAnimLabel(agent ? agent.state : "idle") : (last ? "최근 작업" : "활동 없음");
    var room = OFFICE_ROOMS.find(function (r) { return r.id === def.room; });
    var html = '<div class="modal-backdrop" data-office-close><section class="win team-modal" role="dialog" aria-modal="true" aria-label="' + esc(info.name) + ' 프로필">';
    html += '<div class="win-bar"><span>👤 employee_profile.exe</span><button class="window-close" data-office-close>✕</button></div>';
    html += '<div class="win-body employee-profile">';
    html += '<div class="profile-top">' + officeSpriteHtml(def, 40) + "<div>";
    html += '<span class="status-pill ' + stateKey + '">' + esc(stateLabel) + "</span>";
    html += "<h2>" + esc(info.name) + " <small>· " + esc(room ? room.name : "") + "</small></h2>";
    html += "<p>" + esc(info.role) + " · 근무 " + esc(info.shift) + "</p></div></div>";
    html += '<div class="profile-task"><span class="tiny-label">지금</span><strong id="officeProfileNow">' + esc(animLabel) + (last ? " · 마지막 활동 " + esc(timeAgo(last.at)) : "") + "</strong>";
    html += '<span class="profile-progress"><i style="width:' + Math.min(100, todayN * 20) + '%"></i></span>';
    html += '<span class="meta">오늘 ' + todayN + "건 · 이번 주 " + weekN + "건</span></div>";
    html += '<div class="report-box"><span class="tiny-label">맡은 일</span><strong>' + esc(info.duty) + "</strong>";
    html += '<span class="meta">기준 파일: ' + esc(info.skill) + "</span></div>";
    if (events.length) {
      html += '<div class="profile-recent"><span class="tiny-label">최근 활동</span>';
      events.slice(0, 3).forEach(function (e) {
        html += '<div class="profile-recent-row"><span class="meta">' + esc(timeAgo(e.at)) + " · " + esc(e.stage) + "</span>" + esc((e.title || e.note || "").slice(0, 60)) + "</div>";
      });
      html += "</div>";
    }
    var hasPage = AI_TEAM_MEMBERS.some(function (t) { return t.id === def.id; });
    html += '<div class="profile-actions">';
    if (hasPage) html += '<button class="btn btn-primary" data-office-page="' + def.id + '">🗂 개인 업무 페이지</button>';
    html += '<button class="btn' + (hasPage ? " btn-ghost" : " btn-primary") + '" data-office-log="' + def.id + '">📜 근무일지</button>';
    html += '<button class="text-button" data-office-close>닫기</button></div>';
    html += "</div></section></div>";
    return html;
  }
  // 지도는 46칸 × 16px = 736px 라서 창 3개를 옆에 세우면 폭이 모자라 잘린다.
  // 칸 크기(--tile)만 줄이면 방·가구·직원이 한꺼번에 같은 비율로 작아진다.
  var officeFitBound = false;
  function fitOfficeTile() {
    var card = document.querySelector(".office-card");
    if (!card) return;
    var cs = window.getComputedStyle(card);
    var avail = card.clientWidth - parseFloat(cs.paddingLeft || 0) - parseFloat(cs.paddingRight || 0) - 8;
    // 좁은 화면(휴대폰)에서는 억지로 줄이면 직원이 안 보이니 예전처럼 가로 스크롤로 둔다.
    if (!(avail >= 500)) { card.style.removeProperty("--tile"); return; }
    // 위쪽 한계를 16px 로 묶어 두면 넓은 화면에서 지도가 가운데 작게 떠서 옆이 텅 빈다.
    // 칸을 키워 남는 폭을 꽉 채운다(방·가구·직원이 같은 비율로 커진다).
    var tile = Math.max(11, Math.min(30, Math.floor(avail / OFFICE_W)));
    card.style.setProperty("--tile", tile + "px");
    // 지도 테두리·안쪽 여백은 계산으로 맞추기 번거로워서, 넘치면 한 칸씩 줄여 실제로 맞춘다.
    var wrap = card.querySelector(".office-wrap");
    for (var i = 0; wrap && i < 6 && tile > 11 && wrap.scrollWidth > wrap.clientWidth; i++) {
      tile--; card.style.setProperty("--tile", tile + "px");
    }
  }
  function bindOfficeMap() {
    fitOfficeTile();
    bindOfficeSign();
    if (!officeFitBound) {
      officeFitBound = true;
      window.addEventListener("resize", function () {
        if (officeMapOnPage) fitOfficeTile();
        if (currentView === "home" && homeModeRendered && homeMode() !== homeModeRendered) render();
      });
    }
    var t = document.getElementById("officeWalkToggle");
    if (t) t.addEventListener("click", function () { officeShowWalk = !officeShowWalk; render(); });
    var layer = document.getElementById("officeAgents");
    if (layer) layer.addEventListener("click", function (e) {
      var el = e.target.closest ? e.target.closest("[data-agent]") : null;
      if (!el) return;
      officeProfileId = el.getAttribute("data-agent");
      render();
    });
    Array.prototype.forEach.call(document.querySelectorAll("[data-office-close]"), function (b) {
      b.addEventListener("click", function (e) {
        if (e.target !== b) return;
        officeProfileId = null; render();
      });
    });
    var ceoSend = document.getElementById("ceoOrderSend");
    var ceoInput = document.getElementById("ceoOrderInput");
    if (ceoInput) {
      ceoInput.addEventListener("input", function () { ceoOrderDraft = ceoInput.value; });
      ceoInput.addEventListener("keydown", function (e) {
        if ((e.metaKey || e.ctrlKey) && e.key === "Enter") { e.preventDefault(); sendCeoOrder(ceoInput.value); }
      });
    }
    if (ceoSend) ceoSend.addEventListener("click", function () { sendCeoOrder(ceoInput ? ceoInput.value : ""); });
    Array.prototype.forEach.call(document.querySelectorAll("[data-ceo-quick]"), function (qb) {
      qb.addEventListener("click", function () {
        var q = qb.getAttribute("data-ceo-quick");
        var el = document.getElementById("ceoOrderInput");
        ceoOrderDraft = el && el.value.trim() ? el.value.trim() + " " + q : q;
        if (el) { el.value = ceoOrderDraft; el.focus(); }
      });
    });
    Array.prototype.forEach.call(document.querySelectorAll("[data-agent-open]"), function (b) {
      b.addEventListener("click", function () { officeProfileId = b.getAttribute("data-agent-open"); render(); });
    });
    Array.prototype.forEach.call(document.querySelectorAll("[data-office-page]"), function (b) {
      b.addEventListener("click", function () { teamMemberView = b.getAttribute("data-office-page"); officeProfileId = null; render(); });
    });
    Array.prototype.forEach.call(document.querySelectorAll("[data-office-log]"), function (b) {
      b.addEventListener("click", function () {
        aiLogFilter = b.getAttribute("data-office-log");
        aiLogShowAll = false;
        officeProfileId = null;
        render();
        var card = Array.prototype.find.call(document.querySelectorAll(".card h3"), function (h) { return h.textContent.indexOf("근무일지") === 0 || h.textContent.indexOf("📜") === 0; });
        if (card) card.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    });
  }


  // ───────── 직원 캐릭터 시뮬레이션 (A* 경로 · 상태 5종: 걷기·타이핑·대화·앉기·대기) ─────────
  // 직원 8명 + 대리님. 출입구에서 자기 자리로 걸어가 실제 근무 기록에 따라 타이핑/앉기/대기하고,
  // 가끔 라운지·회의실로 이동해 대화한다. 다른 직원이 서 있는 칸은 A*에서 벽처럼 피해 간다.
  var officeSim = null;
  var OFFICE_AGENT_DEFS = [
    { id: "research", icon: "🔎", name: "시장조사", room: "research", rank: "lead", hair: "#6b3d34", shirt: "#fff3b0", accent: "#ff8fc0", skin: "#ffdcc4" },
    { id: "content", icon: "💡", name: "콘텐츠기획", room: "content", rank: "lead", hair: "#372b4a", shirt: "#c9b8ff", accent: "#c9b8ff", skin: "#f7cdae" },
    { id: "blog", icon: "📝", name: "블로그제작", room: "blog", rank: "lead", hair: "#7b4a2f", shirt: "#b8f0dd", accent: "#ff8fc0", skin: "#ffe3cf" },
    { id: "review", icon: "🕵️", name: "검수", room: "review", rank: "lead", hair: "#2f2a3d", shirt: "#a8d8ff", accent: "#fff3b0", skin: "#eec39f" },
    { id: "approval", icon: "✅", name: "승인", room: "approval", rank: "lead", hair: "#5a3450", shirt: "#ffe6f2", accent: "#e0648d", skin: "#ffdcc4" },
    { id: "carousel", icon: "🎨", name: "이미지구성", room: "carousel", rank: "member", hair: "#c26e4b", shirt: "#ffd6b0", accent: "#ff8fc0", skin: "#f7cdae" },
    { id: "brand", icon: "🧭", name: "브랜드전략", room: "brand", rank: "member", hair: "#3c3a4f", shirt: "#b6ece7", accent: "#2fb0b0", skin: "#ffe3cf" },
    { id: "ops", icon: "🤖", name: "운영비서", room: "ops", rank: "member", hair: "#4a4a63", shirt: "#dcdcec", accent: "#7a7a9a", skin: "#eec39f" },
    { id: "user", icon: "👤", name: "안효준 대리", room: "ceo", rank: "ceo", hair: "#42283a", shirt: "#ff8fc0", accent: "#fff3b0", skin: "#ffdcc4" }
  ];
  function officeAstar(from, to, blocked, allowGoal) {
    // 4방향 A*, 맨해튼 휴리스틱. blocked: "x,y" → true (다른 직원이 선 칸). 목표 칸은 allowGoal 이면 막혀 있어도 허용.
    var key = function (x, y) { return x + "," + y; };
    var open = [{ x: from.x, y: from.y, g: 0, f: Math.abs(from.x - to.x) + Math.abs(from.y - to.y) }];
    var came = {}, gScore = {}; gScore[key(from.x, from.y)] = 0;
    var closed = {};
    var guard = 0;
    while (open.length && guard++ < 6000) {
      var bi = 0; for (var i = 1; i < open.length; i++) if (open[i].f < open[bi].f) bi = i;
      var cur = open.splice(bi, 1)[0];
      var ck = key(cur.x, cur.y);
      if (cur.x === to.x && cur.y === to.y) {
        var path = [{ x: cur.x, y: cur.y }], k = ck;
        while (came[k]) { var pr = came[k]; path.unshift({ x: pr.x, y: pr.y }); k = key(pr.x, pr.y); }
        return path;
      }
      if (closed[ck]) continue; closed[ck] = true;
      [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(function (d) {
        var nx = cur.x + d[0], ny = cur.y + d[1], nk = key(nx, ny);
        if (closed[nk] || !officeWalkable(nx, ny)) return;
        var isGoal = nx === to.x && ny === to.y;
        if (blocked[nk] && !(isGoal && allowGoal)) return;
        var g = cur.g + 1;
        if (gScore[nk] !== undefined && g >= gScore[nk]) return;
        gScore[nk] = g; came[nk] = cur;
        open.push({ x: nx, y: ny, g: g, f: g + Math.abs(nx - to.x) + Math.abs(ny - to.y) });
      });
    }
    return null;
  }
  function officeAgentActivity(id) {
    // 실제 근무 기록에서 상태를 정한다: 20분 내 활동 → 타이핑, 오늘 활동 → 앉기(가끔 타이핑), 없음 → 대기
    var ev = officeSim && officeSim.events ? officeSim.events : [];
    var mine = ev.filter(function (e) { return e.who === id; });
    var last = mine[0];
    var mins = last ? (Date.now() - new Date(last.at).getTime()) / 60000 : Infinity;
    return { live: mins < 20, today: last ? last.at.slice(0, 10) === todayStr() : false, note: last ? (last.title || last.note || "") : "" };
  }
  function officeSimInit() {
    var m = buildOfficeMap();
    var sim = { agents: [], events: aiWorkLogEvents(), tick: 0, timer: null, lastMeeting: Date.now() };
    OFFICE_AGENT_DEFS.forEach(function (d, i) {
      var seat = (m.seats[d.room] || [])[0];
      // 처음부터 각자 자기 방 자리에 앉혀 둔다. 예전엔 전원이 출입구에서 출발해
      // 걸어 들어왔는데, 화면을 열자마자 보이는 그림이 "출입구에 아홉 명이 뭉쳐 있고
      // 방은 전부 비어 있는" 모습이라 사무실로 읽히지 않았다. 출근 장면 한 번보다
      // 평소 모습이 맞는 게 낫다 — 회의·라운지 이동은 그대로 돈다.
      var start = seat || { x: OFFICE_ENTRANCE.x - 1 - Math.floor(i / 2), y: OFFICE_ENTRANCE.y + (i % 2) };
      sim.agents.push({ id: d.id, def: d, x: start.x, y: start.y, tx: start.x, ty: start.y, seat: seat,
        state: seat ? "sit" : "idle", face: "down", path: [], goal: null,
        wait: 8 + i * 5, bubble: "", bubbleUntil: 0, stateUntil: 0,
        plan: seat ? "atSeat" : "toSeat", away: null });
    });
    return sim;
  }
  function officeBlockedMap(exceptAgent) {
    var b = {};
    officeSim.agents.forEach(function (a) {
      if (a === exceptAgent) return;
      b[a.tx + "," + a.ty] = true;
      if (a.path.length) b[a.path[0].x + "," + a.path[0].y] = true;
    });
    return b;
  }
  function officeSetGoal(a, goal, allowGoal) {
    var path = officeAstar({ x: a.tx, y: a.ty }, goal, officeBlockedMap(a), allowGoal);
    if (!path) {
      // 예약 칸까지 막으면 길이 없을 때, 지금 서 있는 칸만 피해서 다시 시도한다
      var cur = {}; officeSim.agents.forEach(function (o) { if (o !== a) cur[o.tx + "," + o.ty] = true; });
      path = officeAstar({ x: a.tx, y: a.ty }, goal, cur, allowGoal);
    }
    if (!path) { a.wait = 8; return false; }
    path.shift(); a.path = path; a.goal = goal; if (path.length) a.state = "walk";
    return true;
  }
  function officeFreeSeatIn(roomId, a) {
    var m = buildOfficeMap();
    var taken = {}; officeSim.agents.forEach(function (o) { if (o !== a) { taken[o.tx + "," + o.ty] = true; if (o.goal) taken[o.goal.x + "," + o.goal.y] = true; } });
    var seats = (m.seats[roomId] || []).filter(function (st) { return !taken[st.x + "," + st.y]; });
    return seats.length ? seats[Math.floor(Math.random() * seats.length)] : null;
  }
  // 회의 소집. 평소엔 시뮬레이션이 가끔 부르고, 조종바의 "결정까지" 버튼이 즉시 부른다.
  // force 면 앉아 있는 사람을 최대한 많이 모은다(결정 시점이라 전원이 모이는 그림이 맞다).
  function officeCallMeeting(force) {
    var sim = officeSim; if (!sim) return 0;
    var now = Date.now();
    sim.lastMeeting = now;
    var cands = sim.agents.filter(function (a) { return a.plan === "atSeat" && !a.away; });
    cands.sort(function () { return Math.random() - 0.5; });
    var take = force ? cands.length : 2 + Math.floor(Math.random() * 2);
    var n = 0;
    cands.slice(0, take).forEach(function (a) {
      var st = officeFreeSeatIn("meeting", a); if (!st) return;
      a.away = { kind: "talk", until: now + (force ? 26000 : 20000 + Math.random() * 15000) };
      a.plan = "toMeeting"; officeSetGoal(a, st, true);
      n++;
    });
    return n;
  }

  function officeSimStep() {
    var sim = officeSim; if (!sim) return;
    sim.tick++;
    var now = Date.now();
    // 회의: 2~3분마다 2~3명이 회의실로 가서 대화
    if (now - sim.lastMeeting > 60000 && Math.random() < 0.06) officeCallMeeting(false);
    sim.agents.forEach(function (a) {
      var speed = 0.2;
      if (a.path.length) {
        var nxt = a.path[0];
        var atCenter = a.x === a.tx && a.y === a.ty;
        if (atCenter) {
          // 다음 칸을 다른 직원이 차지(예약)하고 있으면 들어가지 않는다. 잠깐 기다리다가 계속 막히면 새 경로.
          var occupied = sim.agents.some(function (o) { return o !== a && o.tx === nxt.x && o.ty === nxt.y; });
          if (occupied) {
            a.blockedTicks = (a.blockedTicks || 0) + 1;
            a.state = "idle";
            if (a.blockedTicks > 12) { a.blockedTicks = 0; officeSetGoal(a, a.goal, true); }
            return;
          }
          a.blockedTicks = 0;
          a.tx = nxt.x; a.ty = nxt.y; // 예약
        }
        var dx = nxt.x - a.x, dy = nxt.y - a.y, dist = Math.abs(dx) + Math.abs(dy);
        if (Math.abs(dx) >= Math.abs(dy)) { if (dx !== 0) a.face = dx > 0 ? "right" : "left"; }
        else a.face = dy > 0 ? "down" : "up";
        a.state = "walk";
        if (dist <= speed) { a.x = nxt.x; a.y = nxt.y; a.path.shift(); }
        else { a.x += Math.sign(dx) * Math.min(speed, Math.abs(dx)); a.y += Math.sign(dy) * Math.min(speed, Math.abs(dy)); }
        if (!a.path.length) {
          // 도착
          if (a.plan === "toSeat") {
            a.plan = "atSeat"; a.state = "sit"; a.stateUntil = now + 800;
            // 책상을 바라보게 한다
            var gm = buildOfficeMap().grid;
            var up = gm[a.ty - 1] && gm[a.ty - 1][a.tx], dn = gm[a.ty + 1] && gm[a.ty + 1][a.tx];
            if (up === "T" || up === "M") a.face = "up";
            else if (dn === "T" || dn === "M") a.face = "down";
          }
          else if (a.plan === "toMeeting" || a.plan === "toLounge") { a.plan = "away"; a.state = "talk"; a.bubble = a.plan === "away" && a.away && a.away.kind === "coffee" ? "☕ 잠깐 쉬는 중" : "💬 회의 중"; a.bubbleUntil = a.away ? a.away.until : now + 10000; }
        }
        return;
      }
      if (a.wait > 0) { a.wait--; return; }
      if (a.plan === "toSeat") { officeSetGoal(a, a.seat, true); if (!a.path.length) a.wait = 10; return; }
      if (a.plan === "away") {
        if (a.away && now > a.away.until) { a.away = null; a.plan = "toSeat"; a.bubble = ""; officeSetGoal(a, a.seat, true); }
        else {
          // 대화 중: 옆에 다른 직원이 있으면 talk, 아니면 sit
          var near = sim.agents.some(function (o) { return o !== a && Math.abs(o.tx - a.tx) + Math.abs(o.ty - a.ty) <= 2 && o.plan === "away"; });
          a.state = near ? "talk" : "sit";
        }
        return;
      }
      if (a.plan === "atSeat") {
        var act = officeAgentActivity(a.id);
        if (now < a.stateUntil) return;
        // 커피 타임: 가끔 라운지로
        if (!a.away && Math.random() < 0.03) {
          var ls = officeFreeSeatIn("lounge", a);
          if (ls) { a.away = { kind: "coffee", until: now + 12000 + Math.random() * 10000 }; a.plan = "toLounge"; officeSetGoal(a, ls, true); return; }
        }
        if (act.live) { a.state = "type"; a.bubble = "⌨️ " + (act.note || "작업 중").slice(0, 28); a.bubbleUntil = now + 4000; a.stateUntil = now + 3000; }
        else if (act.today) { a.state = Math.random() < 0.6 ? "type" : "sit"; a.stateUntil = now + 2200 + Math.random() * 3000; if (a.state === "type" && Math.random() < 0.3) { a.bubble = "✅ 오늘 " + (act.note || "").slice(0, 24); a.bubbleUntil = now + 3500; } }
        // 근무 기록이 없는 날엔 예전엔 80%가 sit 이었는데, sit 은 애니메이션이 없어서
        // 화면이 통째로 정지 화면처럼 보였다. 앉아 있어도 뭔가는 하고 있게 비율을 바꾼다.
        else {
          var r = Math.random();
          a.state = r < 0.4 ? "type" : r < 0.75 ? "sit" : "idle";
          a.stateUntil = now + 2200 + Math.random() * 3500;
          if (Math.random() < 0.08) { a.bubble = "💤 다음 근무 대기"; a.bubbleUntil = now + 3000; }
        }
      }
    });
    officeSimDraw();
  }
  function officeSimDraw() {
    var layer = document.getElementById("officeAgents");
    if (!layer) { officeSimStop(); return; }
    var now = Date.now();
    officeSim.agents.forEach(function (a) {
      var el = layer.querySelector('[data-agent="' + a.id + '"]');
      if (!el) {
        el = document.createElement("div");
        el.setAttribute("data-agent", a.id);
        el.style.setProperty("--hair", a.def.hair); el.style.setProperty("--shirt", a.def.shirt);
        el.style.setProperty("--accent", a.def.accent); el.style.setProperty("--skin", a.def.skin);
        el.innerHTML =
          '<span class="ag-bubble"></span>' +
          '<span class="ag-bar"><i></i></span>' +
          '<span class="ag-body">' +
            '<i class="p-shadow"></i><i class="p-leg l"></i><i class="p-leg r"></i>' +
            '<i class="p-torso"></i><i class="p-arm l"></i><i class="p-arm r"></i>' +
            '<i class="p-head"><b class="p-eye l"></b><b class="p-eye r"></b></i>' +
            '<i class="p-hair"></i>' +
          "</span>" +
          '<span class="ag-tag">' + esc(a.def.name) + (a.def.rank === "ceo" ? "<em>대표</em>" : a.def.rank === "lead" ? "<em>팀장</em>" : "") + "</span>";
        layer.appendChild(el);
      }
      var cls = "ag f-" + a.face + " a-" + a.state + " r-" + a.def.rank;
      if (el.className !== cls) el.className = cls;
      el.style.left = "calc(" + (a.x + 0.5) + " * var(--tile))";
      el.style.top = "calc(" + (a.y + 0.9) + " * var(--tile))";
      el.style.zIndex = String(200 + Math.round(a.y));
      var bub = el.firstElementChild;
      var text = a.bubble && now < a.bubbleUntil ? a.bubble : "";
      if (bub.getAttribute("data-text") !== text) {
        bub.setAttribute("data-text", text);
        bub.textContent = text;
        bub.className = "ag-bubble" + (text ? " on" : "");
      }
      if (officeProfileId === a.id) officeProfileLive(a);
    });
    officeFollowTick();
  }
  // 자동 추적 — 지금 일하고 있는(타이핑/대화) 직원 하나를 골라 테두리로 표시하고,
  // 지도가 가로로 잘려 있으면 그 사람이 보이도록 스크롤을 옮긴다.
  // 매 프레임(100ms) 옮기면 화면이 덜덜 떨리므로 대상이 바뀔 때만 한 번 움직인다.
  var officeFollowId = null;
  function officeFollowTick() {
    var layer = document.getElementById("officeAgents");
    if (!layer) return;
    if (!officeFollow()) {
      if (officeFollowId) {
        var prev = layer.querySelector(".ag-follow");
        if (prev) prev.classList.remove("ag-follow");
        officeFollowId = null;
      }
      return;
    }
    var busy = officeSim.agents.filter(function (a) { return a.state === "type" || a.state === "talk" || a.state === "walk"; });
    var pick = busy.length ? busy[0] : officeSim.agents[0];
    if (!pick) return;
    var el = layer.querySelector('[data-agent="' + pick.id + '"]');
    if (!el) return;
    if (officeFollowId === pick.id && el.classList.contains("ag-follow")) return;
    var old = layer.querySelector(".ag-follow");
    if (old) old.classList.remove("ag-follow");
    el.classList.add("ag-follow");
    officeFollowId = pick.id;
    var wrap = document.querySelector(".office-wrap");
    if (wrap && wrap.scrollWidth > wrap.clientWidth + 2) {
      var target = el.offsetLeft - wrap.clientWidth / 2;
      wrap.scrollTo({ left: Math.max(0, target), behavior: "smooth" });
    }
  }
  function officeProfileLive(a) {
    var sp = document.getElementById("officeProfileSprite");
    if (sp) {
      var cls = "ag a-" + a.state + " f-down r-" + a.def.rank;
      if (sp.className !== cls) sp.className = cls;
    }
    var el = document.getElementById("officeProfileNow");
    if (el) {
      if (!el.hasAttribute("data-tail")) {
        var cur = el.textContent, ix = cur.indexOf(" · ");
        el.setAttribute("data-tail", ix === -1 ? "" : cur.slice(ix));
      }
      var next = officeAnimLabel(a.state) + el.getAttribute("data-tail");
      if (el.textContent !== next) el.textContent = next;
    }
  }

  // ── 라이브 오피스 간판 · 시계 · 조종바 ────────────────────────────
  // 화면 위에 "지금 몇 시고, 어느 루틴 시간대고, 오늘 몇 개나 돌았는지"를 띄운다.
  // 버튼은 진짜 동작하는 것만 둔다 — 일시정지·배속은 시뮬레이션 타이머를 실제로 바꾼다.
  // 프로토타입에 있던 '결정까지 / 자동 추적 / 보고 발행'은 뒤에 붙일 실제 동작이 없어 넣지 않았다.
  var OFFICE_SPEEDS = [1, 2, 4];
  function officeSpeed() {
    var v = state.meta && state.meta.officeSpeed;
    return OFFICE_SPEEDS.indexOf(v) === -1 ? 1 : v;
  }
  function officePaused() { return !!(state.meta && state.meta.officePaused); }
  function officeFollow() { return !!(state.meta && state.meta.officeFollow); }

  // 지금이 어느 루틴 시간대인지. ROUTINE_JOBS 의 at 을 그대로 쓴다 — 표를 고치면 여기도 따라온다.
  function officePhaseText(now) {
    var hm = String(now.getHours()).padStart(2, "0") + ":" + String(now.getMinutes()).padStart(2, "0");
    var slots = [];
    ROUTINE_JOBS.forEach(function (j) {
      if (j.cycle !== "daily" || !j.at) return;
      if (slots.indexOf(j.at) === -1) slots.push(j.at);
    });
    slots.sort();
    var cur = null, next = null;
    slots.forEach(function (t) {
      if (hm >= t && hm < addMinutesHHMM(t, 90)) cur = t;
      if (!next && hm < t) next = t;
    });
    if (cur) {
      var names = ROUTINE_JOBS.filter(function (j) { return j.at === cur; }).map(function (j) { return j.name; });
      return names.length + "개 루틴 시간대";
    }
    return next ? next + " 다음 루틴" : "오늘 루틴 종료";
  }
  function addMinutesHHMM(hm, add) {
    var p = hm.split(":");
    var m = parseInt(p[0], 10) * 60 + parseInt(p[1], 10) + add;
    if (m >= 1440) return "23:59";
    return String(Math.floor(m / 60)).padStart(2, "0") + ":" + String(m % 60).padStart(2, "0");
  }
  function officeClockInnerHtml() {
    var now = new Date();
    return '<b id="officeClockTime">' + String(now.getHours()).padStart(2, "0") + ":" +
      String(now.getMinutes()).padStart(2, "0") + "</b>" +
      '<i id="officeClockPhase">' + esc(officePhaseText(now)) + "</i>";
  }
  function officeSignHtml() {
    var ai = OFFICE_AGENT_DEFS.filter(function (d) { return d.id !== "user"; }).length;
    return '<div class="office-sign">' +
      '<div class="os-l">' +
      '<div class="os-kicker">LIVE OFFICE · ' + ai + ' AI STAFF · REAL-TIME</div>' +
      '<h2 class="os-title">효제이 <span>AI OFFICE</span></h2>' +
      '<p class="os-sub">출근해서 자리에 앉아 일하고, 회의실에 모이고, 대표실로 보고하러 갑니다. 움직임은 실제 근무 기록을 따라갑니다.</p>' +
      "</div>" +
      '<div class="os-clock"><span>DAEGU · KST</span>' + officeClockInnerHtml() + "</div></div>";
  }

  // 조종바 — 상태 라벨 · 일시정지 · 배속 · 진행률 · 사람 수 칩
  function officeControlHtml(events) {
    var rows = ROUTINE_JOBS.map(function (j) { return { job: j, st: routineStatus(j, events) }; });
    // 진행률과 완료·보류는 '오늘' 기준이어야 한다. 수시(onDemand) 루틴은 언제 돌았든 상태가 ok 라
    // 전체로 세면 32일 전 캐러셀 제작이 "오늘 완료 1"로 잡힌다 — 실제로 그렇게 나왔다.
    // 그래서 매일 도는 것만 분모로 쓰고, 확인 필요만 전체에서 센다(주간·수시 지연도 놓치면 안 되므로).
    var daily = rows.filter(function (r) { return r.job.cycle === "daily"; });
    var done = daily.filter(function (r) { return r.st.kind === "ok"; }).length;
    var holds = daily.filter(function (r) { return r.st.kind === "hold" || r.st.kind === "blocked"; }).length;
    var bad = rows.filter(function (r) { return r.st.kind === "late" || r.st.kind === "fail"; }).length;
    var total = daily.length;
    var pct = total ? Math.round((done / total) * 100) : 0;

    // '근무'는 오늘 실제로 뭔가 한 직원 수다. 사람 기준이라 루틴 개수와 다르다.
    var today = todayStr();
    var working = OFFICE_AGENT_DEFS.filter(function (d) {
      if (d.id === "user") return false;
      return (events || []).some(function (e) { return e.who === d.id && (e.at || "").slice(0, 10) === today; }) ||
        ROUTINE_JOBS.some(function (j) { return j.who === d.id && (routineRunsFor(j.key)[0] || {}).at && routineRunsFor(j.key)[0].at.slice(0, 10) === today; });
    }).length;

    var label = bad ? bad + "건 확인 필요" : holds ? "일부 보류 — " + done + "/" + total + " 완료" : done ? done + "/" + total + " 루틴 완료" : "오늘 루틴 대기 중";
    var sp = officeSpeed(), paused = officePaused();

    var html = '<div class="office-ctl">';
    html += '<span class="oc-state ' + (bad ? "bad" : holds ? "hold" : "ok") + '">' + esc(label) + "</span>";
    html += '<button type="button" class="oc-btn" id="officePause">' + (paused ? "▶ 재생" : "❚❚ 일시정지") + "</button>";
    html += '<span class="oc-speed"><em>재생 속도</em><span class="oc-speed-row">';
    OFFICE_SPEEDS.forEach(function (v) {
      html += '<button type="button" class="oc-sp' + (v === sp ? " on" : "") + '" data-office-speed="' + v + '">' + v + "x</button>";
    });
    html += "</span></span>";
    // 아래 셋은 프로토타입에 있던 칸이다. 겉모습만 흉내 내지 않고 실제로 무언가 하게 붙였다.
    //  결정까지 = 지금 바로 회의를 소집해 대표 승인 회의실로 모은다(시뮬레이션의 '결정 시점').
    //  자동 추적 = 켜면 지금 일하고 있는 직원을 화면에 잡아 두고 테두리로 표시한다.
    //  보고 발행 = 오늘 마감보고가 있는 업무보고서 화면으로 넘어간다.
    html += '<button type="button" class="oc-btn" id="officeMeetNow" title="직원들을 대표 승인 회의실로 모읍니다">⏭ 결정까지</button>';
    html += '<button type="button" class="oc-btn oc-follow' + (officeFollow() ? " on" : "") +
      '" id="officeFollow" title="지금 일하는 직원을 화면에 잡아 둡니다">👁 자동 추적 ' + (officeFollow() ? "ON" : "OFF") + "</button>";
    html += '<button type="button" class="oc-btn" data-goto="workReports" title="오늘 마감보고를 봅니다">📤 보고 발행</button>';
    html += '<span class="oc-prog"><em>오늘 루틴 진행 · ' + pct + '%</em><i><b style="width:' + pct + '%"></b></i></span>';
    html += '<span class="oc-chips">' +
      '<span class="oc-chip">근무 ' + working + "</span>" +
      '<span class="oc-chip ok">완료 ' + done + "</span>" +
      '<span class="oc-chip hold">보류 ' + holds + "</span>" +
      '<span class="oc-chip bad">확인 ' + bad + "</span></span>";
    html += "</div>";
    return html;
  }
  var officeClockTimer = null;
  function bindOfficeSign() {
    if (officeClockTimer) { clearInterval(officeClockTimer); officeClockTimer = null; }
    if (document.getElementById("officeClockTime")) {
      officeClockTimer = setInterval(function () {
        var t = document.getElementById("officeClockTime");
        if (!t) { clearInterval(officeClockTimer); officeClockTimer = null; return; }
        var now = new Date();
        t.textContent = String(now.getHours()).padStart(2, "0") + ":" + String(now.getMinutes()).padStart(2, "0");
        var ph = document.getElementById("officeClockPhase");
        if (ph) ph.textContent = officePhaseText(now);
      }, 20000);
    }
    var pb = document.getElementById("officePause");
    if (pb) pb.addEventListener("click", function () {
      state.meta.officePaused = !officePaused();
      persistLocal();
      if (state.meta.officePaused) officeSimStop(); else officeSimStart();
      render();
    });
    var mb = document.getElementById("officeMeetNow");
    if (mb) mb.addEventListener("click", function () {
      if (!officeSim) return;
      officeCallMeeting(true);
      if (officePaused()) { state.meta.officePaused = false; persistLocal(); officeSimStart(); }
      toast("대표 승인 회의실로 모읍니다");
      render();
    });
    var fb = document.getElementById("officeFollow");
    if (fb) fb.addEventListener("click", function () {
      state.meta.officeFollow = !officeFollow();
      persistLocal();
      render();
    });
    Array.prototype.forEach.call(document.querySelectorAll("[data-office-speed]"), function (b) {
      b.addEventListener("click", function () {
        state.meta.officeSpeed = parseInt(b.getAttribute("data-office-speed"), 10);
        persistLocal();
        officeSimStop();
        if (!officePaused()) officeSimStart();
        render();
      });
    });
  }

  function officeSimStart() {
    if (!officeSim) officeSim = officeSimInit();
    else officeSim.events = aiWorkLogEvents();
    if (officeSim.timer) return;
    // 배속: 1x = 100ms. 조종바에서 고른 값으로 간격을 나눈다.
    officeSim.timer = setInterval(officeSimStep, Math.max(25, Math.round(100 / officeSpeed())));
  }
  function officeSimStop() { if (officeSim && officeSim.timer) { clearInterval(officeSim.timer); officeSim.timer = null; } }

  function renderAiTeam() {
    if (teamMemberView) { renderAiTeamMember(teamMemberView); return; }
    renderAiTeamRoster();
  }

  // 이 화면에서 "내가 쓴 글"을 볼 수가 없었다 — 글 목록은 직원 카드를 눌러야만 열리는
  // 숨은 화면이었다. 최근 글을 바로 보여 주고 전체 목록으로 가는 길을 낸다.
  function aiTeamBlogShortcutHtml() {
    var posts = (state.blogPosts || []).slice().sort(function (a, b) {
      return String(b.date || b.createdAt || "").localeCompare(String(a.date || a.createdAt || ""));
    });
    var pending = posts.filter(function (p) { return p.status === "발행대기"; }).length;
    var done = posts.filter(function (p) { return p.status === "발행완료"; }).length;
    var held = posts.filter(function (p) { return p.status === "보류"; }).length;

    var html = '<div class="card section-gap"><h3>📝 작성한 글<span class="count">' + posts.length + "건</span></h3>";
    html += '<div class="tb-sum">' +
      pill("발행대기 " + pending, pending >= 20 ? "warn" : "brand") +
      pill("발행완료 " + done, "good") +
      pill("보류 " + held, held ? "danger" : "neutral") + "</div>";
    if (!posts.length) {
      html += '<div class="empty-state">아직 등록된 글이 없습니다.</div>';
    } else {
      posts.slice(0, 5).forEach(function (p) {
        html += '<button type="button" class="list-row is-link" data-goto="blog">' +
          '<span class="txt">' + esc(p.title || "제목 없음") + "</span>" +
          '<span class="meta">' + esc([p.status, p.date || ""].filter(Boolean).join(" · ")) + "</span>" +
          '<span class="go-arrow">›</span></button>';
      });
    }
    html += '<div class="tb-go"><button type="button" class="btn btn-primary btn-sm" data-goto="blog">글 전체 보기 · 발행 처리 →</button></div>';
    html += "</div>";
    return html;
  }

  function renderAiTeamRoster() {
    var workEvents = aiWorkLogEvents();
    var stats = blogStats();
    var todayGoalMet = stats.todayCount >= BLOG_DAILY_GOAL;

    var html = '<div class="page-head"><div><h1>🤖 효제이 AI직원팀</h1><div class="sub">AI 직원 8명이 블로그 5단계 · 이미지 · 브랜드전략 · 대시보드 운영을 나눠 맡습니다.</div></div></div>';

    // 예전엔 이 한 화면에 파이프라인·KPI·루틴표·직원카드·근무일지·조직도가 통째로 쌓여 있었다.
    // 같은 내용이 세 번 겹쳐 보여 어지러웠다(루틴 상태는 홈의 '직원 업무카드' 탭에도 있다).
    // 지금 봐야 할 것만 펴 두고, 나머지는 접어 둔다.
    html += '<div class="kpi-grid cols-4">';
    html += '<div class="kpi-card"><div class="label">오늘 발행</div><div class="value">' + stats.todayCount + ' <small>/ ' + BLOG_DAILY_GOAL + '</small></div>' + pill(todayGoalMet ? "목표 달성" : "목표 미달성", todayGoalMet ? "good" : "warn") + "</div>";
    html += kpiCard("이번주 발행", stats.weekCount, "건");
    html += kpiCard("이번달 발행", stats.monthCount, "건");
    html += kpiCard("전체 등록 글", stats.total, "건");
    html += "</div>";

    html += aiTeamBlogShortcutHtml();
    html += blogAutomationStatusHtml();

    html += '<details class="team-fold"><summary>🗂 업무 분장 · 루틴 상태 · 직원별 근무 현황</summary><div class="team-fold-body">';
    html += routineBoardHtml(workEvents);
    html += aiStaffBoardHtml(workEvents);
    html += "</div></details>";

    html += '<details class="team-fold"><summary>📒 근무일지 · 조직 안내</summary><div class="team-fold-body">';
    html += aiWorkLogHtml(workEvents);
    html += aiTeamOrgInfoHtml();
    html += "</div></details>";
    html += officeProfileHtml();

    document.getElementById("main").innerHTML = html;
    bindAiWorkLog();
    bindOfficeMap();
    officeSimStop();
    Array.prototype.forEach.call(document.querySelectorAll("[data-goto]"), function (btn) {
      btn.addEventListener("click", function () {
        currentView = btn.getAttribute("data-goto");
        teamMemberView = null; pendingImport = null;
        render(); window.scrollTo(0, 0);
      });
    });
    Array.prototype.forEach.call(document.querySelectorAll("[data-team-member]"), function (btn) {
      btn.addEventListener("click", function () { teamMemberView = btn.getAttribute("data-team-member"); render(); });
    });
  }

  // 같은 글이 5단계를 지나면 직원마다 '마지막 활동'이 똑같이 보이므로,
  // 카드에는 글 제목 대신 그 직원이 실제로 한 일(단계 + 본인 메모)을 보여준다.
  var STAGE_ORDER = ["아이디어", "정보검수", "작성", "SEO검수", "발행대기", "최종검토", "최종승인", "보류", "발행완료"];
  function stageRank(e) {
    var st = lastStageLabel(e), i = STAGE_ORDER.indexOf(st);
    return i === -1 ? STAGE_ORDER.length : i;
  }
  function lastStageLabel(e) {
    var st = (e.stage || "").replace(/\(AI직원\)/g, "").replace(/중$/, "").trim();
    return st || "활동";
  }
  function lastWorkDetail(e) {
    var d = (e.note || "").trim();
    if (!d) d = (e.title || "").trim();
    if (!d) return "";
    return d.length > 46 ? d.slice(0, 46) + "…" : d;
  }

  // ── AI 직원 업무 분장 ──────────────────────────────────────────
  // 내가(Claude) 루틴으로 돌리는 일을 직원별로 나눠 적어 둔 표다. 각 루틴은 끝날 때
  // ahj_patch_chunk_ 로 routineRuns 에 {job, at, status, summary, detail} 을 push 한다.
  // 여기 없는 일은 대시보드에서 "돌았는지" 알 수 없으니, 새 루틴을 만들면 여기도 추가한다.
  var ROUTINE_JOBS = [
    { key: "auctionSync", who: "ops", viaRuns: true, name: "경매 결과 자동 동기화",
      cycle: "daily", at: "07:00", desc: "현황판과 대조해 유찰·매각종료·변경·취하를 판정하고 대시보드에 반영" },
    { key: "blogVerify", who: "ops", viaRuns: true, name: "네이버 블로그 발행 확인",
      cycle: "daily", at: "07:00", desc: "사건번호로 우리 블로그 3곳을 훑어 발행완료·글 주소를 채움" },
    { key: "ceoOrder", who: "ops", viaRuns: true, name: "대표 지시 처리",
      cycle: "daily", at: "07:00", desc: "ceo.console에 남긴 지시를 읽어 처리하고 답변을 남김" },
    { key: "closingReport", who: "ops", viaRuns: true, name: "업무마감보고 작성",
      cycle: "daily", at: "15:50", desc: "업무일지 폴더를 읽어 ①~⑥ 마감보고를 만들어 대시보드에 올림" },
    { key: "analysisCheck", who: "ops", viaRuns: true, name: "권리분석 체크 반영",
      cycle: "daily", at: "20:00", desc: "블로그에 올라간 권리분석 글을 사건번호로 맞춰 물건의 '작성됨' 체크를 켬" },
    { key: "blogPipeline", who: "research", name: "블로그 소재 발굴",
      cycle: "daily", at: "08:00", desc: "최근 뉴스·시황·입찰 팁에서 오늘 쓸 소재를 찾음" },
    { key: "blogFactCheck", dependsOn: "blogPipeline", who: "content", name: "소재 정보검수",
      cycle: "daily", at: "08:00", desc: "소재의 통계·사실관계를 출처 원문과 대조" },
    { key: "blogWrite", dependsOn: "blogPipeline", who: "blog", name: "본문 작성",
      cycle: "daily", at: "08:00", desc: "검수를 통과한 소재로 1,500자 이상 본문 작성" },
    { key: "blogSeo", dependsOn: "blogPipeline", who: "review", name: "SEO·형식 검수",
      cycle: "daily", at: "08:00", desc: "제목 길이·메타디스크립션·FAQ·해시태그·분량 점검" },
    { key: "blogApprove", dependsOn: "blogPipeline", who: "approval", name: "최종검토 · 발행대기 승인",
      cycle: "daily", at: "08:00", desc: "기준 미달은 보류 확정, 통과는 발행대기로 올림" },
    { key: "carousel", who: "carousel", name: "인스타 캐러셀 제작",
      cycle: "onDemand", at: "", desc: "콘텐츠기획 항목이 승인되면 스와이프 카드 초안 제작" },
    { key: "brandWeekly", who: "brand", name: "경쟁사 조사 · 차별화 도출",
      cycle: "weekly", at: "", desc: "대구 경쟁 경매학원의 수강료·과정·채널·광고문구 비교" }
  ];

  function routineRunsFor(key) {
    return (state.routineRuns || []).filter(function (r) { return r && r.job === key; })
      .sort(function (a, b) { return (b.at || "").localeCompare(a.at || ""); });
  }

  // 오늘 돌았어야 하는데 기록이 없으면 '지연'이다. 며칠째인지까지 센다.
  // 루틴이 남긴 기록(routineRuns)만 보면, 예전부터 일해 온 직원이 "실행 기록 없음"으로
  // 잘못 뜬다. 실제 활동 기록(근무일지)도 같이 보고 둘 중 최근 것을 쓴다.
  // 루틴이 언제 시작해서 언제 끝났는지. 15:40 원본 저장 이후에 시작해 15:50 전에 끝나야 해서
  // 기록에 startedAt·finishedAt 을 남기고 화면에 그대로 보여준다.
  function routineRunSpanText(run) {
    if (!run) return "";
    var st = run.startedAt || "";
    var fi = run.finishedAt || run.at || "";
    if (!st && !fi) return "";
    function hm(v) { try { return new Date(v).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" }); } catch (e) { return ""; } }
    if (st && fi) {
      var sec = Math.max(0, Math.round((new Date(fi) - new Date(st)) / 1000));
      return hm(st) + " 시작 → " + hm(fi) + " 완료 (" + sec + "초)";
    }
    return hm(fi) + " 완료";
  }
  function routineLastRun(job, events) {
    // 그 일 자체의 기록이 있으면 그것이 정답이다. 한 사람이 두 가지 일을 맡을 수 있어서
    // (운영 비서 = 경매 동기화 + 발행 확인) 사람 기준 활동 기록을 먼저 쓰면 둘이 뒤섞인다.
    var own = routineRunsFor(job.key)[0];
    if (own) return own;
    // routineRuns 로만 기록되는 일(운영 비서의 아침 점검 3종)은 사람 기준 활동 기록으로 대체하지 않는다.
    // 대체하면 같은 담당의 다른 일 기록을 빌려와 "안 돌았는데 돌았다"고 보인다.
    if (job.viaRuns) return null;
    var who = (events || []).filter(function (e) { return e.who === job.who; })[0];
    if (!who) return null;
    return { at: who.at, status: "ok", summary: who.title || who.stage || "", detail: who.note || "", fromLog: true };
  }

  function routineStatus(job, events) {
    var last = routineLastRun(job, events);
    var today = todayStr();
    var lastDay = last ? (last.at || "").slice(0, 10) : "";

    if (job.cycle === "onDemand") {
      if (!last) return { kind: "idle", label: "대기 (조건 충족 시 실행)", last: null };
      return { kind: last.status === "fail" ? "fail" : "ok", label: last.status === "fail" ? "오류" : "최근 실행", last: last };
    }
    if (job.cycle === "weekly") {
      var wk = weekRange();
      if (lastDay >= wk.start && lastDay <= wk.end) {
        return { kind: last.status === "fail" ? "fail" : "ok", label: "이번 주 완료", last: last };
      }
      return { kind: "late", label: last ? "이번 주 미실행" : "실행 기록 없음", last: last };
    }

    // daily
    if (lastDay === today) {
      if (last.status === "fail") return { kind: "fail", label: "오류", last: last };
      if (last.status === "hold") return { kind: "hold", label: "보류", last: last };
      return { kind: "ok", label: "오늘 완료", last: last };
    }
    // 앞 단계가 오늘 보류였으면 뒷 단계는 '고장'이 아니라 '할 일이 없어서 안 돈 것'이다
    if (job.dependsOn) {
      var parent = ROUTINE_JOBS.find(function (x) { return x.key === job.dependsOn; });
      if (parent) {
        var pst = routineStatus(parent, events);
        if (pst.kind === "hold") return { kind: "blocked", label: "앞 단계 보류로 대기", last: last };
      }
    }
    var due = job.at && nowHHMM() >= job.at;
    if (!due) return { kind: "wait", label: (job.at || "") + " 예정", last: last };
    if (!lastDay) return { kind: "late", label: "실행 기록 없음", last: null };
    var days = daysBetween(lastDay, today);
    return { kind: "late", label: days + "일째 미실행", last: last };
  }

  function nowHHMM() {
    var d = new Date();
    return String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
  }
  function daysBetween(a, b) {
    return Math.round((parseYMD(b).getTime() - parseYMD(a).getTime()) / 86400000);
  }

  var ROUTINE_TONE = { ok: "good", hold: "warn", wait: "neutral", late: "danger", fail: "danger", blocked: "neutral", idle: "neutral" };
  var ROUTINE_ICON = { ok: "✅", hold: "⏸", wait: "⏳", late: "🔴", fail: "⚠️", blocked: "⤵", idle: "💤" };

  function routineBoardHtml(events) {
    var problems = 0;
    var byWho = {};
    ROUTINE_JOBS.forEach(function (j) {
      var st = routineStatus(j, events);
      if (st.kind === "late" || st.kind === "fail") problems++;
      (byWho[j.who] = byWho[j.who] || []).push({ job: j, st: st });
    });

    var html = '<div class="card section-gap"><h3>🗂 업무 분장 · 루틴 상태 <span class="count">' +
      (problems ? problems + "건 확인 필요" : "이상 없음") + "</span></h3>";
    html += '<div class="rt-note">내가 자동으로 돌리는 일을 직원별로 나눈 표입니다. 돌았는지·무엇이 막혔는지 여기서 봅니다.</div>';
    html += '<div class="rt-list">';
    AI_WORK_ROSTER.forEach(function (m) {
      var rows = byWho[m.id];
      if (!rows) return;
      html += '<div class="rt-person"><div class="rt-person-head"><span class="rt-ico">' + m.icon + "</span><b>" + esc(m.name) + "</b></div>";
      rows.forEach(function (r) {
        var st = r.st, j = r.job;
        html += '<div class="rt-row ' + st.kind + '">';
        html += '<span class="rt-badge">' + ROUTINE_ICON[st.kind] + "</span>";
        html += '<span class="rt-main"><b>' + esc(j.name) + '</b><i>' + esc(j.desc) + "</i></span>";
        html += '<span class="rt-side">' + pill(st.label, ROUTINE_TONE[st.kind]) +
          '<em>' + esc(j.cycle === "daily" ? "매일 " + j.at : j.cycle === "weekly" ? "매주" : "수시") + "</em></span>";
        if (st.last && st.last.summary) {
          var span = routineRunSpanText(st.last);
          html += '<span class="rt-detail">' + esc(st.last.summary) +
            (span ? ' <i>' + esc(span) + "</i>" : "") +
            (st.last.at ? ' <i>' + esc(timeAgo(st.last.at)) + "</i>" : "") + "</span>";
        }
        html += "</div>";
      });
      html += "</div>";
    });
    html += "</div></div>";
    return html;
  }


  // 직원 업무카드 — 스킬 파일 하나 = 카드 하나. ROUTINE_JOBS 11개를 그대로 깐다.
  // 메뉴 안쪽 "업무 분장 · 루틴 상태"에 묻혀 있던 것을 홈 첫 화면으로 끌어올린 것이다.
  // 카드 한 장에 [담당 · 맡은 일 · 역할 한 줄 · 주기 · 오늘 상태 · 마지막 실행 · 막힌 것]이 다 들어간다.
  function staffJobCycleText(j) {
    if (j.cycle === "daily") return "매일 " + (j.at || "");
    if (j.cycle === "weekly") return "매주";
    return "수시";
  }
  // 담당자 표의 skill 칸은 사람에 따라 스킬 파일 이름이거나(blog-writer) 설명 문장이다.
  // 파일 이름일 때만 코드체 칩으로 보여 준다 — 설명 문장을 칩에 넣으면 줄이 터진다.
  function staffSkillFile(m) {
    var s = (m && m.skill) || "";
    return /^[a-z0-9-]+$/.test(s) ? s : "";
  }
  function staffJobBoardHtml(events) {
    var rows = ROUTINE_JOBS.map(function (j) { return { job: j, st: routineStatus(j, events) }; });
    var problems = rows.filter(function (r) { return r.st.kind === "late" || r.st.kind === "fail"; }).length;
    var holds = rows.filter(function (r) { return r.st.kind === "hold" || r.st.kind === "blocked"; }).length;
    var dones = rows.filter(function (r) { return r.st.kind === "ok"; }).length;

    var html = '<div class="sjb section-gap">';
    html += '<div class="sjb-head"><h2>🗂 직원 업무카드</h2>' +
      '<div class="sjb-sum">' +
      pill("오늘 완료 " + dones, dones ? "good" : "neutral") +
      pill("보류·대기 " + holds, holds ? "warn" : "neutral") +
      pill("확인 필요 " + problems, problems ? "danger" : "neutral") +
      '</div></div>';
    html += '<div class="sjb-note">스킬 파일 하나가 카드 하나입니다. 누가 · 무슨 일을 · 언제 하고 · 지금 어떤 상태인지 한 장에 담았습니다.</div>';
    html += '<div class="sjb-grid">';

    rows.forEach(function (r) {
      var j = r.job, st = r.st;
      var m = AI_WORK_ROSTER.find(function (x) { return x.id === j.who; }) || { icon: "🤖", name: j.who };
      var skill = staffSkillFile(m);
      html += '<div class="sjb-card k-' + st.kind + '">';
      html += '<div class="sjb-top"><span class="sjb-ico">' + m.icon + "</span>" +
        '<span class="sjb-who">' + esc(m.name) + "</span>" +
        '<span class="sjb-cycle">' + esc(staffJobCycleText(j)) + "</span></div>";
      html += '<div class="sjb-job">' + ROUTINE_ICON[st.kind] + " " + esc(j.name) + "</div>";
      html += '<div class="sjb-desc">' + esc(j.desc) + "</div>";
      html += '<div class="sjb-state">' + pill(st.label, ROUTINE_TONE[st.kind]) +
        (skill ? '<code class="sjb-skill">' + esc(skill) + "</code>" : "") + "</div>";

      if (st.last && (st.last.summary || st.last.at)) {
        var span = routineRunSpanText(st.last);
        html += '<div class="sjb-last"><b>마지막 실행</b>' +
          (st.last.summary ? "<span>" + esc(st.last.summary) + "</span>" : "") +
          '<i>' + esc([span, st.last.at ? timeAgo(st.last.at) : ""].filter(Boolean).join(" · ")) + "</i></div>";
      } else {
        html += '<div class="sjb-last none"><b>마지막 실행</b><span>기록 없음</span></div>';
      }

      // 막힌 것은 숨기지 않는다. 여기가 비어 있으면 대리님이 원인을 찾으러 메뉴를 파고들어야 한다.
      // 다만 "지금" 막힌 사유여야 한다. 마지막 기록이 오늘 것이 아니면 그 기록의 detail 은
      // 며칠 전 사정이라 여기 쓰면 안 된다 — 실제로 '앞 단계 보류로 대기' 카드에 엿새 전
      // 정보검수 메모가 붙어 나왔다. 오늘 기록일 때만 쓰고, 아니면 상태로 설명한다.
      if (st.kind === "late" || st.kind === "fail" || st.kind === "hold" || st.kind === "blocked") {
        var lastIsToday = !!(st.last && (st.last.at || "").slice(0, 10) === todayStr() && !st.last.fromLog);
        var why = "";
        if (st.kind === "blocked") {
          var par = ROUTINE_JOBS.find(function (x) { return x.key === j.dependsOn; }) || {};
          why = "앞 단계(" + (par.name || "") + ")가 오늘 보류라 넘어올 일이 없습니다. 안 돈 게 아니라 할 일이 없는 상태입니다.";
        } else if (lastIsToday && st.last.detail) {
          why = st.last.detail;
        } else if (st.kind === "late") {
          why = j.cycle === "weekly"
            ? "이번 주 실행 기록이 없습니다. 주기를 바꾸거나 한 번 돌려야 합니다."
            : "돌아야 할 시각(" + (j.at || "") + ")이 지났는데 오늘 기록이 없습니다. 루틴이 실패했거나, 일은 했는데 기록을 못 남기고 끝났을 수 있습니다.";
        } else if (st.kind === "fail") {
          why = "마지막 실행이 오류로 끝났습니다.";
        } else if (st.kind === "hold") {
          why = "조건 때문에 일부러 건너뛴 상태입니다.";
        }
        if (why.length > 130) why = why.slice(0, 130) + "…";
        if (why) html += '<div class="sjb-why"><b>지금 막힌 것</b>' + esc(why) + "</div>";
      }
      html += "</div>";
    });

    html += "</div></div>";
    return html;
  }

  // 직원 9명 통합 보드 — 기존 직원카드 그리드 + 근무현황 카드를 하나로 합친 것
  function aiStaffBoardHtml(events) {
    var today = todayStr(), wk = weekRange();
    var liveN = 0;
    var cards = AI_WORK_ROSTER.map(function (m) {
      var mine = events.filter(function (e) { return e.who === m.id; });
      var todayN = mine.filter(function (e) { return e.at.slice(0, 10) === today; }).length;
      var weekN = mine.filter(function (e) { var d = e.at.slice(0, 10); return d >= wk.start && d <= wk.end; }).length;
      var last = mine[0];
      var mins = last ? (Date.now() - new Date(last.at).getTime()) / 60000 : Infinity;
      var live = mins < 20;
      if (live) liveN++;
      var kind = live ? "live" : todayN ? "done" : "idle";
      var label = live ? "근무 중" : todayN ? "오늘 완료" : "대기";
      var def = OFFICE_AGENT_DEFS.find(function (d) { return d.id === m.id; });
      var h = '<button type="button" class="staff-card ' + kind + '" data-agent-open="' + m.id + '">';
      h += '<span class="staff-avatar">' + m.icon + "</span>";
      h += '<span class="staff-main"><span class="staff-name">' + esc(m.name) + '<i class="staff-state ' + kind + '">' + label + "</i></span>";
      h += '<span class="staff-role">' + esc(m.role) + "</span>";
      h += '<span class="staff-meta">' + esc(m.shift) + " · 오늘 <b>" + todayN + "</b>건 · 이번 주 <b>" + weekN + "</b>건</span>";
      h += '<span class="staff-last">' + (last ? '<i>' + esc(timeAgo(last.at)) + " · " + esc(lastStageLabel(last)) + " · </i>" + esc(lastWorkDetail(last)) : "아직 활동 기록 없음") + "</span>";
      h += "</span></button>";
      return h;
    }).join("");
    var html = '<div class="card section-gap"><h3>👥 직원 <span class="count">AI ' + (AI_WORK_ROSTER.length - 1) + "명 · 대표 1명 · 지금 근무 중 " + liveN + "명</span></h3>";
    html += '<div class="staff-grid">' + cards + "</div>";
    html += '<div class="staff-foot">직원을 누르면 프로필 · 담당 업무 · 최근 활동을 볼 수 있습니다. 상태는 실제 근무일지 기록으로 계산합니다.</div>';
    html += "</div>";
    return html;
  }

  function renderAiTeamMember(id) {
    var member = AI_TEAM_MEMBERS.find(function (m) { return m.id === id; });
    if (!member) { teamMemberView = null; renderAiTeamRoster(); return; }
    if (id === "research") renderMarketResearch();
    else if (id === "content") renderContentIdeas();
    else if (id === "review") renderReviewInbox();
    else if (id === "approval") renderApprovalInbox();
    else if (id === "blog") renderBlog();
    else if (id === "carousel") renderCarouselDrafts();
    else if (id === "brand") renderBrandStrategy();
    else { teamMemberView = null; renderAiTeamRoster(); return; }

    var bar = '<div class="team-member-bar"><button type="button" class="btn btn-sm" id="teamBackBtn">← 효제이 AI직원팀으로</button>' +
      '<div class="team-member-id"><span class="team-member-icon">' + member.icon + '</span><div><strong>' + esc(member.name) + '</strong>' +
      '<div class="sub">' + esc(member.desc) + "</div></div></div></div>";
    document.getElementById("main").insertAdjacentHTML("afterbegin", bar);
    document.getElementById("teamBackBtn").addEventListener("click", function () { teamMemberView = null; render(); });
  }

  /* ---------------- 이미지구성팀 (인스타그램 캐러셀 초안) ---------------- */
  function renderCarouselDrafts() {
    var html = "";
    html += '<div class="page-head"><div><h1>이미지구성팀</h1><div class="sub">콘텐츠기획팀 항목이 승인(완료)되면 인스타그램 캐러셀 초안을 만듭니다. 실제 게시는 하지 않고 HTML 초안 미리보기·다운로드까지만 제공합니다.</div></div></div>';

    var drafts = state.carouselDrafts.slice().sort(function (a, b) { return (b.createdAt || "").localeCompare(a.createdAt || ""); });

    if (drafts.length === 0) {
      html += '<div class="empty-state">아직 만들어진 캐러셀 초안이 없습니다. 콘텐츠기획팀 항목을 승인(완료 처리)한 뒤, 채팅으로 "이미지구성팀 캐러셀 만들어줘"라고 요청하면 여기에 초안이 올라옵니다.</div>';
    } else {
      html += '<div class="blog-post-list">';
      drafts.forEach(function (d) {
        var linkedIdea = state.contentIdeas.find(function (c) { return c.id === d.contentIdeaId; });
        html += '<div class="blog-post-card">';
        html += '<div class="blog-post-top"><div><div class="blog-post-date">' + esc(d.contentType || "") + (linkedIdea ? " · 연결: " + esc(linkedIdea.title) : "") + '</div><div class="blog-post-title">' + esc(d.title || "(제목 없음)") + "</div></div></div>";
        html += '<div class="blog-post-tags">' + pill((d.slideCount || (d.slidesOutline || []).length || 0) + "장", "brand") + (d.purpose ? pill(d.purpose, "neutral") : "") + "</div>";
        if (d.caption) html += '<div class="blog-post-memo">' + esc(d.caption) + "</div>";
        if (d.factCheckNotes && d.factCheckNotes.length) {
          html += '<div class="blog-post-hold"><strong>⚠ 추가 확인 필요</strong><br>' + d.factCheckNotes.map(esc).join("<br>") + "</div>";
        }
        html += '<div class="blog-post-footer">';
        html += '<button class="btn btn-ghost btn-sm" data-carousel-preview="' + d.id + '">🔍 미리보기</button>';
        html += '<div class="row-actions">';
        html += '<button class="btn btn-primary btn-sm" data-carousel-download="' + d.id + '">📥 HTML 다운로드</button>';
        html += '<button class="icon-btn" data-del="carouselDraft" data-id="' + d.id + '" aria-label="삭제">✕</button>';
        html += "</div></div>";
        html += "</div>";
      });
      html += "</div>";
    }

    document.getElementById("main").innerHTML = html;

    Array.prototype.forEach.call(document.querySelectorAll("[data-carousel-preview]"), function (btn) {
      btn.addEventListener("click", function () { openCarouselPreview(btn.getAttribute("data-carousel-preview")); });
    });
    Array.prototype.forEach.call(document.querySelectorAll("[data-carousel-download]"), function (btn) {
      btn.addEventListener("click", function () { downloadCarouselHtml(btn.getAttribute("data-carousel-download")); });
    });
    bindTableCommon("carouselDraft");
  }

  function openCarouselPreview(id) {
    var d = state.carouselDrafts.find(function (x) { return x.id === id; });
    if (!d) return;
    var overlay = document.createElement("div");
    overlay.className = "carousel-preview-overlay";
    overlay.innerHTML =
      '<div class="carousel-preview-box">' +
      '<button type="button" class="carousel-preview-close" id="carouselPreviewCloseBtn" aria-label="닫기">✕</button>' +
      '<h2 style="font-size:15px;font-weight:800;padding-right:36px">' + esc(d.title || "캐러셀 미리보기") + "</h2>" +
      '<div class="carousel-frame-wrap"><iframe title="carousel preview" sandbox="allow-scripts"></iframe></div>' +
      '<div class="carousel-preview-meta">' +
      (d.caption ? "<strong>캡션</strong><div>" + esc(d.caption) + "</div>" : "") +
      (d.hashtags && d.hashtags.length ? '<div class="blog-post-tags" style="margin-top:8px">' + d.hashtags.map(function (h) { return pill("#" + h.replace(/^#/, ""), "accent"); }).join("") + "</div>" : "") +
      "</div>" +
      '<div class="blog-post-footer" style="border-top:none;margin-top:14px;padding-top:0">' +
      '<button type="button" class="btn btn-primary btn-sm" id="carouselPreviewDownloadBtn">📥 HTML 다운로드</button>' +
      "</div>" +
      "</div>";
    document.body.appendChild(overlay);
    var iframe = overlay.querySelector("iframe");
    iframe.srcdoc = d.html || "<p style='font:14px sans-serif;padding:20px'>HTML 내용이 없습니다.</p>";
    function close() { overlay.remove(); }
    overlay.addEventListener("click", function (e) { if (e.target === overlay) close(); });
    overlay.querySelector("#carouselPreviewCloseBtn").addEventListener("click", close);
    overlay.querySelector("#carouselPreviewDownloadBtn").addEventListener("click", function () { downloadCarouselHtml(id); });
  }

  function downloadCarouselHtml(id) {
    var d = state.carouselDrafts.find(function (x) { return x.id === id; });
    if (!d || !d.html) { toast("다운로드할 HTML이 없습니다."); return; }
    if (!window.claude || !window.claude.downloads) { toast("이 화면에서는 다운로드를 지원하지 않습니다."); return; }
    var baseName = (d.title || "carousel").replace(/[\\/:*?"<>|]/g, "").slice(0, 60) || "carousel";
    window.claude.downloads.save({ filename: baseName + ".html", data: d.html }).then(function () {
      toast("다운로드를 시작했습니다.");
    }).catch(function (err) {
      var code = err && err.code;
      if (code === "extension_not_enabled" || code === "rejected_extension") {
        window.claude.downloads.save({ filename: baseName + ".txt", data: d.html }).then(function () {
          toast("이 화면에서는 .html 저장이 막혀있어 .txt로 저장했습니다. 저장 후 파일 확장자를 .html로 바꿔서 열어주세요.");
        }).catch(function () { toast("다운로드에 실패했습니다."); });
        return;
      }
      if (code === "declined") return;
      toast("다운로드에 실패했습니다" + (err && err.message ? ": " + err.message : "."));
    });
  }

  /* ---------------- 브랜드전략 담당 (경쟁사 분석) ---------------- */
  function renderBrandStrategy() {
    var html = "";
    html += '<div class="page-head"><div><h1>브랜드전략 담당</h1><div class="sub">대구 지역 경쟁 경매교육 업체를 매주 조사해 차별화 소재를 도출합니다. 실제 게시·광고 집행은 하지 않고 분석 리포트만 작성합니다.</div></div></div>';

    var reports = state.brandStrategyReports.slice().sort(function (a, b) { return (b.weekOf || "").localeCompare(a.weekOf || ""); });

    if (reports.length === 0) {
      html += '<div class="empty-state">아직 작성된 경쟁사 분석 리포트가 없습니다. 채팅으로 "브랜드전략팀 이번주 분석해줘"라고 요청하면 여기에 리포트가 올라옵니다.</div>';
    } else {
      html += '<div class="blog-post-list">';
      reports.forEach(function (r) {
        var competitors = r.competitors || [];
        html += '<div class="blog-post-card">';
        html += '<div class="blog-post-top"><div><div class="blog-post-date">' + formatShortDate(r.weekOf) + ' 주차</div><div class="blog-post-title">경쟁사 분석 (' + competitors.length + '개 업체)</div></div></div>';

        if (competitors.length) {
          html += '<div class="table-wrap" style="margin-top:10px"><table class="data-table"><thead><tr><th>업체명</th><th>수강료</th><th>강의기간</th><th>채널</th><th>후기 요약</th></tr></thead><tbody>';
          competitors.forEach(function (c) {
            var channels = [c.website ? "홈페이지" : null, c.blog ? "블로그" : null, c.youtube ? "유튜브" : null, c.instagram ? "인스타" : null].filter(Boolean).join(", ") || "-";
            html += "<tr><td>" + esc(c.name || "") + "</td><td>" + esc(c.tuition || "-") + "</td><td>" + esc(c.duration || "-") + "</td><td>" + esc(channels) + "</td><td class=\"memo-cell\">" + esc(c.reviews || "-") + "</td></tr>";
          });
          html += "</tbody></table></div>";

          html += '<details class="blog-post-stagelog" style="margin-top:10px"><summary>업체별 12개 항목 상세 보기</summary><div style="margin-top:8px">';
          competitors.forEach(function (c) {
            html += '<div style="margin-bottom:14px;padding-bottom:12px;border-bottom:1px solid var(--border)">';
            html += '<div style="font-weight:800;font-size:13px;margin-bottom:6px">' + esc(c.name || "") + "</div>";
            [["수강료", c.tuition], ["강의과정", c.curriculum], ["강의기간", c.duration], ["홈페이지", c.website], ["블로그", c.blog], ["유튜브", c.youtube], ["인스타그램", c.instagram], ["후기", c.reviews], ["콘텐츠 주제", c.contentTopics], ["광고 문구", c.adCopy], ["CTA", c.cta], ["대표 이미지", c.representativeImageNote]].forEach(function (pair) {
              html += '<div class="sub" style="margin-top:3px"><b>' + pair[0] + ':</b> ' + esc(pair[1] || "확인 안 됨") + "</div>";
            });
            html += "</div>";
          });
          html += "</div></details>";
        }

        if (r.analysis) {
          html += '<div style="margin-top:12px">';
          [["📢 경쟁사가 많이 이야기하는 것", r.analysis.whatCompetitorsTalkALot], ["🤐 경쟁사가 이야기하지 않는 것", r.analysis.whatCompetitorsDontTalk], ["💪 우리가 강조할 수 있는 것", r.analysis.whatWeCanEmphasize], ["🎯 고객이 반응할 가능성이 높은 메시지", r.analysis.likelyResonantMessage]].forEach(function (pair) {
            if (!pair[1]) return;
            html += '<div class="blog-post-memo"><strong>' + pair[0] + "</strong><br>" + esc(pair[1]) + "</div>";
          });
          html += "</div>";
        }

        if (r.differentiationIdeas) {
          html += '<div class="brand-idea-box"><strong>✨ 옆커폰부동산에듀 차별화 소재 제안</strong><br>' + esc(r.differentiationIdeas) + "</div>";
        }

        if (r.sourceNotes && r.sourceNotes.length) {
          html += '<div class="blog-post-hold"><strong>⚠ 추가 확인 필요</strong><br>' + r.sourceNotes.map(esc).join("<br>") + "</div>";
        }

        html += '<div class="blog-post-footer"><div class="row-actions"><button class="icon-btn" data-del="brandStrategy" data-id="' + r.id + '" aria-label="삭제">✕</button></div></div>';
        html += "</div>";
      });
      html += "</div>";
    }

    document.getElementById("main").innerHTML = html;
    bindTableCommon("brandStrategy");
  }

  /* ---------------- Market Research ---------------- */
  function renderMarketResearch() {
    var html = "";
    html += '<div class="page-head"><div><h1>시장조사</h1><div class="sub">지역 시황·경쟁 매물·강의자료용 리서치 요청을 등록하고 진행 상황을 관리합니다</div></div></div>';

    html += '<form class="add-form" id="marketResearchForm">';
    html += field("요청일", '<input type="date" name="requestedDate" value="' + todayStr() + '" required>');
    html += field("지역", '<input type="text" name="region" placeholder="예: 대구 수성구" required>');
    html += field("목적", selectHtml("purpose", MARKET_RESEARCH_PURPOSE, MARKET_RESEARCH_PURPOSE[0]));
    html += field("우선순위", selectHtml("priority", PRIORITY_LEVELS, "보통"));
    html += field("조사 주제", '<input type="text" name="topic" placeholder="예: 경쟁 학원 수강료 비교" required>', "grow");
    html += '<button type="submit" class="btn btn-primary">+ 조사 요청 등록</button>';
    html += "</form>";

    html += '<div class="filter-bar">';
    html += '<button class="filter-chip" data-mr-filter="all" aria-pressed="' + (marketResearchFilterStatus === "all") + '">전체</button>';
    WORKFLOW_STAGES.forEach(function (s) {
      html += '<button class="filter-chip" data-mr-filter="' + s + '" aria-pressed="' + (marketResearchFilterStatus === s) + '">' + s + "</button>";
    });
    html += "</div>";

    var filtered = state.marketResearch.filter(function (r) { return marketResearchFilterStatus === "all" || r.status === marketResearchFilterStatus; })
      .slice().sort(function (a, b) { return b.requestedDate.localeCompare(a.requestedDate); });

    if (filtered.length === 0) {
      html += '<div class="empty-state">등록된 시장조사 요청이 없습니다.</div>';
    } else {
      html += '<div class="table-wrap"><table class="data-table"><thead><tr><th>요청일</th><th>지역</th><th>목적</th><th>주제</th><th>우선순위</th><th>상태</th><th>결과 요약</th><th></th></tr></thead><tbody>';
      filtered.forEach(function (r) {
        html += "<tr>";
        html += "<td>" + formatShortDate(r.requestedDate) + "</td>";
        html += '<td><input type="text" class="inline-select" data-inline-text="region" data-id="' + r.id + '" data-entity="marketResearch" value="' + esc(r.region) + '" style="min-width:100px"></td>';
        html += "<td>" + selectHtml("purpose", MARKET_RESEARCH_PURPOSE, r.purpose, r.id, "marketResearch") + "</td>";
        html += '<td class="memo-cell"><input type="text" class="inline-select" data-inline-text="topic" data-id="' + r.id + '" data-entity="marketResearch" value="' + esc(r.topic) + '" style="min-width:160px"></td>';
        html += "<td>" + selectHtml("priority", PRIORITY_LEVELS, r.priority, r.id, "marketResearch") + "</td>";
        html += "<td>" + selectHtml("status", WORKFLOW_STAGES, r.status, r.id, "marketResearch") + "</td>";
        html += '<td class="memo-cell"><input type="text" class="inline-select" data-inline-text="findings" data-id="' + r.id + '" data-entity="marketResearch" value="' + esc(r.findings || "") + '" placeholder="조사 결과 요약" style="min-width:180px"></td>';
        html += '<td><button class="icon-btn" data-del="marketResearch" data-id="' + r.id + '" aria-label="삭제">✕</button></td>';
        html += "</tr>";
      });
      html += "</tbody></table></div>";
    }

    html += blogStageQueueSectionHtml("아이디어", "📰 블로그 소재 발굴 대기");

    document.getElementById("main").innerHTML = html;
    attachBlogPreviewIfAny();

    document.getElementById("marketResearchForm").addEventListener("submit", function (e) {
      e.preventDefault();
      var fd = new FormData(e.target);
      var topic = (fd.get("topic") || "").toString().trim();
      var region = (fd.get("region") || "").toString().trim();
      if (!topic || !region) return;
      state.marketResearch.push({
        id: uid(), requestedDate: fd.get("requestedDate"), region: region, purpose: fd.get("purpose"),
        topic: topic, priority: fd.get("priority"), status: "대기", findings: "", createdAt: new Date().toISOString()
      });
      saveState(); toast("시장조사 요청이 등록되었습니다."); render();
    });

    Array.prototype.forEach.call(document.querySelectorAll("[data-mr-filter]"), function (btn) {
      btn.addEventListener("click", function () { marketResearchFilterStatus = btn.getAttribute("data-mr-filter"); render(); });
    });

    bindTableCommon("marketResearch");
  }

  /* ---------------- Content Ideas ---------------- */
  function renderContentIdeas() {
    var html = "";
    html += '<div class="page-head"><div><h1>콘텐츠 아이디어</h1><div class="sub">블로그·강의자료·SNS 등 모든 콘텐츠 소재를 한곳에서 관리합니다</div></div></div>';

    html += '<form class="add-form" id="contentIdeaForm">';
    html += field("제목", '<input type="text" name="title" placeholder="예: 경매 초보자를 위한 용어 정리 카드뉴스" required>', "grow");
    html += field("카테고리", selectHtml("category", CONTENT_IDEA_CATEGORY, CONTENT_IDEA_CATEGORY[0]));
    html += field("메모", '<input type="text" name="memo" placeholder="참고 자료, 방향성 등">', "grow");
    html += '<button type="submit" class="btn btn-primary">+ 아이디어 등록</button>';
    html += "</form>";

    html += '<div class="filter-bar">';
    html += '<button class="filter-chip" data-ci-filter="all" aria-pressed="' + (contentIdeaFilterStatus === "all") + '">전체</button>';
    WORKFLOW_STAGES.forEach(function (s) {
      html += '<button class="filter-chip" data-ci-filter="' + s + '" aria-pressed="' + (contentIdeaFilterStatus === s) + '">' + s + "</button>";
    });
    html += "</div>";

    var filtered = state.contentIdeas.filter(function (c) { return contentIdeaFilterStatus === "all" || c.status === contentIdeaFilterStatus; })
      .slice().sort(function (a, b) { return b.createdAt.localeCompare(a.createdAt); });

    if (filtered.length === 0) {
      html += '<div class="empty-state">등록된 콘텐츠 아이디어가 없습니다.</div>';
    } else {
      html += '<div class="table-wrap"><table class="data-table"><thead><tr><th>제목</th><th>카테고리</th><th>메모</th><th>상태</th><th></th></tr></thead><tbody>';
      filtered.forEach(function (c) {
        html += "<tr>";
        html += '<td><input type="text" class="inline-select" data-inline-text="title" data-id="' + c.id + '" data-entity="contentIdea" value="' + esc(c.title) + '" style="min-width:180px"></td>';
        html += "<td>" + selectHtml("category", CONTENT_IDEA_CATEGORY, c.category, c.id, "contentIdea") + "</td>";
        html += '<td class="memo-cell"><input type="text" class="inline-select" data-inline-text="memo" data-id="' + c.id + '" data-entity="contentIdea" value="' + esc(c.memo || "") + '" style="min-width:160px"></td>';
        html += "<td>" + selectHtml("status", WORKFLOW_STAGES, c.status, c.id, "contentIdea") + "</td>";
        html += '<td><button class="icon-btn" data-del="contentIdea" data-id="' + c.id + '" aria-label="삭제">✕</button></td>';
        html += "</tr>";
      });
      html += "</tbody></table></div>";
    }

    html += blogStageQueueSectionHtml("정보검수중", "📰 블로그 정보검수 대기");

    document.getElementById("main").innerHTML = html;
    attachBlogPreviewIfAny();

    document.getElementById("contentIdeaForm").addEventListener("submit", function (e) {
      e.preventDefault();
      var fd = new FormData(e.target);
      var title = (fd.get("title") || "").toString().trim();
      if (!title) return;
      state.contentIdeas.push({
        id: uid(), title: title, category: fd.get("category"), memo: (fd.get("memo") || "").toString(),
        status: "대기", createdAt: new Date().toISOString()
      });
      saveState(); toast("콘텐츠 아이디어가 등록되었습니다."); render();
    });

    Array.prototype.forEach.call(document.querySelectorAll("[data-ci-filter]"), function (btn) {
      btn.addEventListener("click", function () { contentIdeaFilterStatus = btn.getAttribute("data-ci-filter"); render(); });
    });

    bindTableCommon("contentIdea");
  }

  /* ---------------- Review / Approval inbox (cross-cutting views) ---------------- */
  function workflowInboxItems(stage) {
    var items = [];
    state.marketResearch.forEach(function (r) {
      if (r.status === stage) items.push({ id: r.id, kind: "시장조사", entity: "marketResearch", title: r.region + " · " + r.topic, meta: r.purpose, priority: r.priority });
    });
    state.contentIdeas.forEach(function (c) {
      if (c.status === stage) items.push({ id: c.id, kind: "콘텐츠 아이디어", entity: "contentIdea", title: c.title, meta: c.category, priority: null });
    });
    return items;
  }

  function advanceWorkflowItem(entity, id, nextStatus) {
    var listKey = entity === "marketResearch" ? "marketResearch" : "contentIdeas";
    var item = state[listKey].find(function (x) { return x.id === id; });
    if (!item) return;
    item.status = nextStatus;
    item.updatedAt = new Date().toISOString();
    saveState(); render();
  }

  function renderReviewInbox() {
    var items = workflowInboxItems("검수대기");
    var html = "";
    html += '<div class="page-head"><div><h1>검수함</h1><div class="sub">시장조사 · 콘텐츠 아이디어 중 검수가 필요한 항목을 모아 보여줍니다</div></div></div>';
    if (items.length === 0) {
      html += '<div class="empty-state">검수 대기 중인 항목이 없습니다.</div>';
    } else {
      html += '<div class="blog-post-list">';
      items.forEach(function (it) {
        html += '<div class="blog-post-card status-accent">';
        html += '<div class="blog-post-top"><div><div class="blog-post-date">' + esc(it.kind) + '</div><div class="blog-post-title">' + esc(it.title) + "</div></div></div>";
        html += '<div class="blog-post-tags">' + pill(it.meta, "neutral") + (it.priority ? pill(it.priority, PRIORITY_PILL[it.priority]) : "") + "</div>";
        html += '<div class="blog-post-footer"><button class="btn btn-primary btn-sm" data-review-pass="' + it.entity + ":" + it.id + '">✅ 검수 완료 → 승인 대기로</button></div>';
        html += "</div>";
      });
      html += "</div>";
    }

    html += blogStageQueueSectionHtml("SEO검수중", "📰 블로그 SEO검수 대기");

    document.getElementById("main").innerHTML = html;
    attachBlogPreviewIfAny();
    Array.prototype.forEach.call(document.querySelectorAll("[data-review-pass]"), function (btn) {
      btn.addEventListener("click", function () {
        var parts = btn.getAttribute("data-review-pass").split(":");
        advanceWorkflowItem(parts[0], parts[1], "승인대기");
        toast("검수가 완료되어 승인함으로 이동했습니다.");
      });
    });
  }

  function renderApprovalInbox() {
    var items = workflowInboxItems("승인대기");
    var html = "";
    html += '<div class="page-head"><div><h1>승인함</h1><div class="sub">검수를 통과해 최종 승인만 남은 시장조사 · 콘텐츠 아이디어 항목입니다</div></div></div>';
    if (items.length === 0) {
      html += '<div class="empty-state">승인 대기 중인 항목이 없습니다.</div>';
    } else {
      html += '<div class="blog-post-list">';
      items.forEach(function (it) {
        html += '<div class="blog-post-card status-good">';
        html += '<div class="blog-post-top"><div><div class="blog-post-date">' + esc(it.kind) + '</div><div class="blog-post-title">' + esc(it.title) + "</div></div></div>";
        html += '<div class="blog-post-tags">' + pill(it.meta, "neutral") + (it.priority ? pill(it.priority, PRIORITY_PILL[it.priority]) : "") + "</div>";
        html += '<div class="blog-post-footer"><button class="btn btn-primary btn-sm" data-approve="' + it.entity + ":" + it.id + '">🎉 승인 → 완료 처리</button></div>';
        html += "</div>";
      });
      html += "</div>";
    }

    html += blogStageQueueSectionHtml("보류", "📰 블로그 보류 항목 — 사유 확인 필요");
    html += blogStageQueueSectionHtml("발행대기", "📰 블로그 발행대기 — 대리님 최종 승인 대기");

    document.getElementById("main").innerHTML = html;
    attachBlogPreviewIfAny();
    Array.prototype.forEach.call(document.querySelectorAll("[data-approve]"), function (btn) {
      btn.addEventListener("click", function () {
        var parts = btn.getAttribute("data-approve").split(":");
        advanceWorkflowItem(parts[0], parts[1], "완료");
        toast("승인되어 완료 처리했습니다.");
      });
    });
  }

  /* ---------------- Schedule ---------------- */
  function scheduleListHtml(list) {
    if (list.length === 0) return '<div class="empty-state">해당하는 일정이 없습니다.</div>';
    return list.slice().sort(function (a, b) { return (a.date + (a.time || "")).localeCompare(b.date + (b.time || "")); }).map(function (s) {
      return '<div class="task-row">' +
        '<span class="task-date">' + formatShortDate(s.date) + (s.time ? " " + esc(s.time) : "") + "</span>" +
        pill(s.type, "brand") +
        '<span class="task-title">' + esc(s.title) + (s.client ? " · " + esc(s.client) : "") + "</span>" +
        '<button class="icon-btn" data-del="schedule" data-id="' + s.id + '" aria-label="삭제">✕</button>' +
        "</div>";
    }).join("");
  }

  function renderSchedule() {
    var today = todayStr();
    var overdue = state.schedule.filter(function (s) { return s.date < today; });
    var todayList = state.schedule.filter(function (s) { return s.date === today; });
    var upcoming = state.schedule.filter(function (s) { return s.date > today; });

    var html = "";
    html += '<div class="page-head"><div><h1>일정</h1><div class="sub">상담·현장답사·강의 등 날짜가 있는 업무 약속을 관리합니다</div></div></div>';

    html += '<form class="add-form" id="scheduleForm">';
    html += field("날짜", '<input type="date" name="date" value="' + today + '" required>');
    html += field("시간", '<input type="time" name="time">');
    html += field("유형", selectHtml("type", SCHEDULE_TYPES, SCHEDULE_TYPES[0]));
    html += field("제목", '<input type="text" name="title" placeholder="예: 경매 컨설팅 상담" required>', "grow");
    html += field("고객/대상", '<input type="text" name="client" placeholder="예: 김투자">');
    html += '<button type="submit" class="btn btn-primary">+ 일정 추가</button>';
    html += "</form>";

    html += '<div class="task-group-title">지난 일정 (' + overdue.length + "건)</div>";
    html += scheduleListHtml(overdue);
    html += '<div class="task-group-title">오늘 · ' + formatShortDate(today) + " (" + todayList.length + "건)</div>";
    html += scheduleListHtml(todayList);
    html += '<div class="task-group-title">예정 (' + upcoming.length + "건)</div>";
    html += scheduleListHtml(upcoming);

    document.getElementById("main").innerHTML = html;

    document.getElementById("scheduleForm").addEventListener("submit", function (e) {
      e.preventDefault();
      var fd = new FormData(e.target);
      var title = (fd.get("title") || "").toString().trim();
      if (!title) return;
      state.schedule.push({
        id: uid(), date: fd.get("date"), time: (fd.get("time") || "").toString(), type: fd.get("type"),
        title: title, client: (fd.get("client") || "").toString(), createdAt: new Date().toISOString()
      });
      saveState(); toast("일정이 추가되었습니다."); render();
    });

    bindTableCommon("schedule");
  }

  /* ---------------- Work Reports ---------------- */
  /* ---------------- 업무일지 자동 수집 (Google Drive 폴더) ---------------- */
  // 대리님 업무일지는 별도 폴더에 Google 문서로 쌓인다(업무일지_YYYY-MM-DD_작성자.
  // 매일 15:40 이후 그날 문서가 올라오고, GPT/Codex 가 최종본을 따로 올린다).
  // 여기서는 그 폴더를 "읽기만" 한다 — 원본 문서는 절대 수정하지 않는다.
  var DRIVE_WORKLOG_FOLDER_ID = "1ZZysuh-y_E3iEwH8O6h93teygbX_jige";
  var DRIVE_WORKLOG_FOLDER_URL = "https://drive.google.com/drive/folders/" + DRIVE_WORKLOG_FOLDER_ID;
  var WORKLOG_TITLE_PREFIX = "업무일지_";
  var WORKLOG_SECTION_BY_MARK = {
    "①": "deliverables", "②": "outcomes", "③": "comparison",
    "④": "problems", "⑤": "solutions", "⑥": "priorities"
  };

  // 파일 이름으로 작성 주체를 가른다. GPT 대화에 직접 접근할 방법은 없으므로,
  // GPT/Codex 가 "파일로 저장해 둔" 최종본만 최종본으로 인정한다.
  function workLogSourceOf(title) {
    var t = String(title || "").toUpperCase();
    if (t.indexOf("CLOSING") !== -1 || t.indexOf("마감") !== -1) {
      return { source: "closing", author: "부동산팀 안효준 대리", key: "closing" };
    }
    if (t.indexOf("CODEX") !== -1 || t.indexOf("GPT") !== -1 || t.indexOf("최종") !== -1) {
      return { source: "codex-final", author: "Codex", key: "codex" };
    }
    return { source: "ai-draft", author: "AI 업무일지 담당", key: "ai" };
  }

  // JSON 으로 올라온 보고서. Markdown·Docs 와 같은 6항목 구조로 맞춘다.
  function parseWorkLogJson(text) {
    var obj;
    try { obj = JSON.parse(text); } catch (e) { return null; }
    if (Array.isArray(obj)) obj = obj[0];
    if (!obj || typeof obj !== "object") return null;
    // 패치 청크 형식({op,list,fields})으로 올려도 받아준다.
    if (obj.fields && typeof obj.fields === "object") obj = obj.fields;
    var sec = obj.sections;
    if (!sec || typeof sec !== "object") {
      // sections 없이 항목 키가 평평하게 있는 경우
      var flat = {};
      ["deliverables", "outcomes", "comparison", "problems", "solutions", "priorities"].forEach(function (k) {
        if (typeof obj[k] === "string" && obj[k].trim()) flat[k] = obj[k].trim();
      });
      sec = Object.keys(flat).length ? flat : null;
    }
    if (!sec && typeof obj.summary === "string") {
      var p = parseWorkLogText(obj.summary);
      sec = Object.keys(p.sections).length ? p.sections : null;
    }
    if (!sec) return null;
    var out = {};
    Object.keys(WORKLOG_SECTION_BY_MARK).forEach(function (m) {
      var k = WORKLOG_SECTION_BY_MARK[m];
      var v = sec[k];
      if (Array.isArray(v)) v = v.join("\n");
      if (typeof v === "string" && v.trim()) out[k] = v.trim();
    });
    return { sections: out, note: String(obj.note || obj.author || "").slice(0, 300), raw: obj };
  }

  function workLogDateOf(title, text) {
    var m = /(20\d\d)[-.\/](\d{1,2})[-.\/](\d{1,2})/.exec(String(title || ""));
    if (!m) m = /(20\d\d)[-.\/](\d{1,2})[-.\/](\d{1,2})/.exec(String(text || "").slice(0, 400));
    if (!m) return "";
    return m[1] + "-" + ("0" + m[2]).slice(-2) + "-" + ("0" + m[3]).slice(-2);
  }

  // Google 문서를 text/plain 으로 내려받으면 줄머리에 역슬래시가 붙는 경우가 있어 걷어낸다.
  function workLogCleanLine(line) {
    return String(line).replace(/\r/g, "").replace(/\\(?=[#*_`~\[\]().\-])/g, "");
  }

  function parseWorkLogText(text) {
    var lines = String(text || "").replace(/﻿/g, "").split("\n");
    var sections = {};
    var cur = null;
    var headMeta = [];
    lines.forEach(function (raw) {
      var line = workLogCleanLine(raw);
      var hm = /^\s*(#{1,6})\s*(.+?)\s*$/.exec(line);
      if (hm) {
        var level = hm[1].length;
        var heading = hm[2];
        var mark = /^\s*[*_\s]*([①②③④⑤⑥])/.exec(heading);
        if (mark && level <= 3) { cur = WORKLOG_SECTION_BY_MARK[mark[1]]; sections[cur] = sections[cur] || []; return; }
        if (level <= 2) { cur = null; return; }          // 다른 큰 제목을 만나면 항목 종료
        if (cur) { sections[cur].push("▸ " + heading); return; }  // 항목 안의 소제목은 본문에 넣는다
        return;
      }
      // 제목(#)을 안 쓰고 "① 결과물" / "**① 결과물**" 로만 쓴 글도 받는다(GPT·Markdown 출력 대응).
      var plain = /^\s*[*_\s]*([①②③④⑤⑥])\s*[.、:)\]]?\s*(.*)$/.exec(line);
      if (plain) {
        cur = WORKLOG_SECTION_BY_MARK[plain[1]];
        sections[cur] = sections[cur] || [];
        var rest = plain[2].replace(/[*_]+$/, "").trim();
        // "① 결과물" 처럼 항목 이름만 있는 줄은 버리고, 뒤에 내용이 붙어 있으면 살린다.
        if (rest && !/^(결과물|성과|전일|대비|문제|해결|자동화|우선업무)/.test(rest)) sections[cur].push(rest);
        return;
      }
      if (!cur) { if (headMeta.length < 4 && line.trim()) headMeta.push(line.trim()); return; }
      sections[cur].push(line);
    });
    var out = {};
    Object.keys(sections).forEach(function (k) {
      var v = sections[k].join("\n").replace(/\n{3,}/g, "\n\n").trim();
      if (v) out[k] = v;
    });
    return { sections: out, note: headMeta.join(" · ").slice(0, 300) };
  }

  function workLogSummaryText(parsed, fullText) {
    var keys = Object.keys(parsed.sections || {});
    if (!keys.length) return String(fullText || "").trim();
    var order = ["deliverables", "outcomes", "comparison", "problems", "solutions", "priorities"];
    var marks = { deliverables: "① 결과물", outcomes: "② 성과", comparison: "③ 전일·전주 대비",
      problems: "④ 문제", solutions: "⑤ 해결·자동화", priorities: "⑥ 우선업무" };
    return order.filter(function (k) { return parsed.sections[k]; }).map(function (k) {
      return marks[k] + "\n" + parsed.sections[k];
    }).join("\n\n");
  }

  function workLogSyncState() {
    if (!state.meta.workLogSync) state.meta.workLogSync = { at: "", status: "", message: "", files: [], added: 0, updated: 0 };
    return state.meta.workLogSync;
  }

  // opts.notify = true 면 토스트·동기화 로그를 남긴다(수동 새로고침 버튼에서 사용).
  // 문서 한 장 내려받기. 지나가는 오류(unavailable · no reply 등)면 잠깐 쉬고 두 번 더.
  function driveDownloadWithRetry(fileId, attempt) {
    return window.claude.mcp.callTool(DRIVE_SERVER, "download_file_content", { fileId: fileId }).catch(function (err) {
      if (attempt < 2 && driveIsTransient(err)) {
        return driveWait(400 * (attempt + 1)).then(function () { return driveDownloadWithRetry(fileId, attempt + 1); });
      }
      throw err;
    });
  }
  function mergeWorkLogDocsIfNeeded(onDone, opts) {
    opts = opts || {};
    function finish() { if (onDone) onDone(); }
    if (!window.claude || !window.claude.mcp) {
      if (opts.notify) toast("이 화면에서는 Drive 를 읽을 수 없습니다.");
      finish(); return;
    }
    var sync = workLogSyncState();
    // 문서는 그날 중 여러 번 갱신된다. 파일ID + 수정시각을 키로 써서 "내용이 바뀌면 다시 읽는다".
    var seen = state.meta.processedWorkLogDocs || {};
    var stats = { added: 0, updated: 0, files: [], skipped: 0, problems: [] };
    // 직접 search_files 를 부르면 열 때 몰리는 30개 병합과 같이 Drive 를 두드려 "service unavailable"
    // 을 받자마자 실패로 찍었다(홈 알림 "자동 수집 실패 — 업무일지"). 줄 세워 재시도하는 경로로 보낸다.
    driveSearchAllFiles("parentId = '" + DRIVE_WORKLOG_FOLDER_ID + "'").then(function (filesRaw) {
      var result = { payload: { files: filesRaw } };
      var files = ((result.payload && result.payload.files) || []).filter(function (f) {
        // 이름이 "업무일지_" 로 시작하는 것만 읽는다. 확장자는 상관없다(.md/.json/Google 문서).
        return f.title && f.title.indexOf(WORKLOG_TITLE_PREFIX) === 0;
      });
      if (!files.length) return { none: true };
      files.sort(function (a, b) { return String(a.title) < String(b.title) ? 1 : -1; });
      // 최근 14개까지만 훑는다(과거 문서를 매번 다시 내려받지 않도록).
      files = files.slice(0, 14);
      var pending = files.filter(function (f) { return seen[f.id + "@" + (f.modifiedTime || "")] !== true; });
      if (!pending.length) return { none: true, checked: files.length };
      var chain = Promise.resolve();
      pending.forEach(function (f) {
        chain = chain.then(function () {
          return driveDownloadWithRetry(f.id, 0).then(function (dl) {
            var b64 = dl.payload && dl.payload.content;
            if (!b64) { stats.skipped++; return; }
            var text = base64ToUtf8(b64);
            var date = workLogDateOf(f.title, text);
            if (!date) { stats.skipped++; return; }
            var who = workLogSourceOf(f.title);
            // Google 문서 · Markdown(.md/.txt) · JSON(.json) 셋 다 받는다.
            var isJson = /\.json$/i.test(f.title) || String(f.mimeType || "").indexOf("json") !== -1 ||
              /^\s*[\[{]/.test(text);
            var parsed = isJson ? parseWorkLogJson(text) : null;
            var format = isJson && parsed ? "json" : (/\.(md|markdown|txt)$/i.test(f.title) ? "markdown" : "gdoc");
            if (!parsed) parsed = parseWorkLogText(text);
            if (!parsed || !Object.keys(parsed.sections || {}).length) {
              stats.skipped++;
              stats.problems.push(f.title + " — ①~⑥ 항목을 찾지 못했습니다");
              return;
            }
            var id = "wr-" + date + "-" + who.key;
            var rec = {
              id: id, date: date, period: "일간",
              source: who.source, author: who.author,
              sections: parsed.sections,
              summary: workLogSummaryText(parsed, text),
              sourceFile: f.title,
              sourceFormat: format,
              sourceUrl: f.viewUrl || "",
              sourceFileId: f.id,
              generatedAt: f.modifiedTime || new Date().toISOString(),
              collectedAt: new Date().toISOString()
            };
            var existing = (state.workReports || []).filter(function (x) { return x.id === id; })[0];
            if (existing) {
              // 같은 날짜·작성자는 새로 만들지 않고 갱신한다. 사람이 직접 쓴 메모(note)는 건드리지 않는다.
              rec.revision = (existing.revision || 1) + 1;
              rec.createdAt = existing.createdAt || rec.collectedAt;
              Object.keys(rec).forEach(function (k) { existing[k] = rec[k]; });
              stats.updated++;
            } else {
              rec.revision = 1;
              rec.createdAt = rec.generatedAt;
              state.workReports.push(rec);
              stats.added++;
            }
            stats.files.push({ title: f.title, at: f.modifiedTime || "", url: f.viewUrl || "", format: format, kind: who.key });
            seen[f.id + "@" + (f.modifiedTime || "")] = true;
          });
        });
      });
      return chain.then(function () { return { checked: files.length }; });
    }).then(function (res) {
      state.meta.processedWorkLogDocs = seen;
      sync.at = new Date().toISOString();
      sync.status = "ok";
      sync.message = (res && res.none)
        ? "새로 올라온 업무일지가 없습니다" + (res.checked ? " (문서 " + res.checked + "개 확인)" : "")
        : "업무일지 " + (stats.added + stats.updated) + "건 수집 (신규 " + stats.added + " · 갱신 " + stats.updated + ")";
      sync.added = stats.added; sync.updated = stats.updated;
      sync.problems = stats.problems.slice(0, 5);
      if (stats.problems.length) sync.message += " · 건너뜀 " + stats.problems.length + "건";
      if (stats.files.length) sync.files = stats.files.slice(0, 6);
      persistLocal();
      if (stats.added || stats.updated) {
        notifySync("📋 업무일지 " + (stats.added + stats.updated) + "건을 수집했습니다 (신규 " + stats.added + " · 갱신 " + stats.updated + ").");
        render();
        driveSaveSnapshot(null, true);
      } else if (opts.notify) {
        toast(sync.message);
        render();
      }
    }).catch(function (err) {
      var msg = (err && err.message) ? err.message : String(err);
      sync.at = new Date().toISOString();
      sync.status = "fail";
      sync.message = msg.slice(0, 200);
      pushSyncEvent("⚠ 자동 수집 실패 — 업무일지: " + sync.message + (driveIsTransient(err) ? " (잠시 후 자동으로 다시 시도합니다)" : ""));
      state.meta.lastSyncError = { at: sync.at, job: "업무일지", message: sync.message };
      persistLocal();
      if (opts.notify) { toast("업무일지 수집 실패: " + sync.message); render(); }
    }).then(finish);
  }

  // 업무보고서 작성 주체를 구분한다. Codex 최종본과 15:40 AI 원본이 같은 날짜에 나란히 남는다.
  var WORK_REPORT_SOURCES = {
    "codex-final": { label: "🤖 Codex 최종본", tone: "brand" },
    "ai-draft": { label: "🧠 AI 원본", tone: "neutral" },
    "manual": { label: "✍️ 직접 작성", tone: "accent" },
    "closing": { label: "📌 업무마감보고", tone: "brand" }
  };
  // 최종 업무마감보고 6개 항목. 외부(Codex)가 sections 에 담아 보내면 항목별로 나눠 보여준다.
  var WORK_REPORT_SECTIONS = [
    { key: "deliverables", label: "① 결과물" },
    { key: "outcomes", label: "② 성과" },
    { key: "comparison", label: "③ 전일 · 전주 대비" },
    { key: "problems", label: "④ 문제" },
    { key: "solutions", label: "⑤ 해결 · 자동화" },
    { key: "priorities", label: "⑥ 우선업무" }
  ];
  // 하루치 보고서는 최대 3종이 남는다 — 원본(ai) · GPT 최종본(codex) · 마감본(closing).
  // 셋을 그냥 늘어놓으면 같은 업무가 세 번 세어진 것처럼 보이므로, 날짜로 묶고
  // "집계 대상은 하나"라는 걸 화면에서 못 박는다. 원본은 지우지 않고 근거자료로 보관한다.
  var WORK_REPORT_KIND = {
    closing: { rank: 1, label: "📌 마감본", note: "집계 대상" },
    "codex-final": { rank: 2, label: "🤖 GPT 최종본", note: "근거자료" },
    "ai-draft": { rank: 3, label: "🧠 AI 원본", note: "근거자료" },
    manual: { rank: 4, label: "✍️ 직접 작성", note: "집계 대상" }
  };
  function workReportKind(r) {
    return WORK_REPORT_KIND[(r && r.source) || "manual"] || WORK_REPORT_KIND.manual;
  }
  // 그날의 "집계 대상" 하나를 고른다. 마감본 > 직접 작성 > GPT 최종본 > AI 원본 순.
  function workReportPrimary(list) {
    return list.slice().sort(function (a, b) { return workReportKind(a).rank - workReportKind(b).rank; })[0];
  }
  function workReportDayGroups() {
    var byDate = {};
    (state.workReports || []).forEach(function (r) {
      var d = String(r.date || "");
      (byDate[d] = byDate[d] || []).push(r);
    });
    return Object.keys(byDate).sort(function (a, b) { return b.localeCompare(a); }).map(function (d) {
      var list = byDate[d].slice().sort(function (a, b) {
        return workReportKind(a).rank - workReportKind(b).rank ||
          String(b.createdAt || "").localeCompare(String(a.createdAt || ""));
      });
      var hasGpt = list.some(function (r) { return r.source === "codex-final"; });
      var auto = list.some(function (r) { return r.source === "ai-draft" || r.source === "codex-final" || r.source === "closing"; });
      return { date: d, list: list, primary: workReportPrimary(list), hasGpt: hasGpt, auto: auto };
    });
  }

  function workReportSourceMeta(r) {
    return WORK_REPORT_SOURCES[r && r.source] || null;
  }
  function workReportBodyHtml(r) {
    var secs = r && r.sections;
    var has = secs && typeof secs === "object" && WORK_REPORT_SECTIONS.some(function (sc) {
      return typeof secs[sc.key] === "string" && secs[sc.key].trim();
    });
    // sections 가 없는 예전 보고서·직접 작성분은 예전처럼 본문을 통째로 보여준다.
    if (!has) return '<div class="blog-post-memo">' + esc((r && r.summary) || "") + "</div>";
    var html = '<div class="wr-sections">';
    WORK_REPORT_SECTIONS.forEach(function (sc) {
      var v = typeof secs[sc.key] === "string" ? secs[sc.key].trim() : "";
      if (!v) return;
      html += '<div class="wr-sec"><div class="wr-sec-k">' + esc(sc.label) + "</div>" +
        '<div class="wr-sec-v">' + esc(v) + "</div></div>";
    });
    html += "</div>";
    return html;
  }
  function renderWorkReports() {
    var html = "";
    html += '<div class="page-head"><div><h1>업무보고서</h1><div class="sub">일간·주간·월간 업무 진행 상황을 기록해둡니다</div></div></div>';

    // 수집 상태 + 수동 새로고침. 브라우저가 닫혀 있는 동안에는 수집이 돌지 않으므로
    // "언제 마지막으로 읽었는지"와 "지금 바로 읽기"를 화면에서 바로 볼 수 있게 둔다.
    var wsync = workLogSyncState();
    var wok = wsync.status === "ok";
    var wfail = wsync.status === "fail";
    html += '<div class="card section-gap"><h3>📋 업무일지 자동 수집' +
      '<span class="count">' + (state.workReports || []).length + "건 보관</span></h3>";
    html += '<div class="list-row"><span class="txt">원본 폴더</span><span class="meta">' +
      '<a href="' + esc(DRIVE_WORKLOG_FOLDER_URL) + '" target="_blank" rel="noopener">Google Drive 업무일지 폴더 ↗</a></span></div>';
    html += '<div class="list-row"><span class="txt">마지막 수집</span><span class="meta">' +
      (wsync.at ? new Date(wsync.at).toLocaleString("ko-KR") : "아직 수집한 적 없음") + "</span>" +
      (wfail ? pill("실패", "danger") : wok ? pill("성공", "good") : pill("대기", "neutral")) + "</div>";
    if (wsync.message) {
      html += '<div class="hint" style="margin-top:2px">' + esc(wsync.message) + "</div>";
    }
    if (wsync.files && wsync.files.length) {
      html += '<div class="hint" style="margin-top:10px;font-weight:700">최근 읽은 원본 문서</div>';
      wsync.files.forEach(function (f) {
        html += '<div class="list-row"><span class="txt">' +
          (f.url ? '<a href="' + esc(f.url) + '" target="_blank" rel="noopener">' + esc(f.title) + "</a>" : esc(f.title)) +
          '</span><span class="meta">' + (f.at ? new Date(f.at).toLocaleString("ko-KR") : "") + "</span></div>";
      });
    }
    html += '<div style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap">' +
      '<button class="btn btn-primary btn-sm" id="workLogSyncBtn">🔄 지금 수집</button>' +
      '<a class="btn btn-ghost btn-sm" href="' + esc(DRIVE_WORKLOG_FOLDER_URL) + '" target="_blank" rel="noopener">원본 폴더 열기 ↗</a></div>';
    html += '<div class="hint" style="margin-top:10px">원본 문서는 <b>읽기만</b> 합니다 — 수정·삭제하지 않습니다. 같은 날짜·작성자의 보고서는 새로 만들지 않고 갱신합니다. 문서가 수정되면 다음 수집 때 다시 읽어 반영합니다.</div>';
    html += '<div class="hint">대시보드가 <b>열려 있는 동안에만</b> 수집합니다 — 열 때 1회, 이후 3분마다, 다른 탭에서 돌아올 때. 닫혀 있는 동안의 수집은 <b>15:41~15:50 KST</b> 서버 루틴이 대신합니다.</div>';
    html += "</div>";

    html += '<form class="add-form" id="workReportForm">';
    html += field("날짜", '<input type="date" name="date" value="' + todayStr() + '" required>');
    html += field("구분", selectHtml("period", REPORT_PERIODS, REPORT_PERIODS[0]));
    html += field("내용", '<textarea name="summary" placeholder="오늘/이번주 진행한 업무를 정리해주세요" style="min-height:70px;width:100%" required></textarea>', "grow");
    html += '<button type="submit" class="btn btn-primary">+ 보고서 작성</button>';
    html += "</form>";

    var groups = workReportDayGroups();
    if (!groups.length) {
      html += '<div class="empty-state">작성된 업무보고서가 없습니다.</div>';
    } else {
      groups.forEach(function (g) {
        html += '<div class="wr-day">';
        html += '<div class="wr-day-head"><b>' + esc(formatShortDate(g.date)) + "</b>" +
          '<span class="wr-day-kinds">' + g.list.map(function (r) {
            return '<i class="wr-kind' + (r === g.primary ? " on" : "") + '">' + esc(workReportKind(r).label) + "</i>";
          }).join("") + "</span>";
        // GPT 최종본이 없으면 그날 GPT 업무가 빠진 것이므로 눈에 띄게 알린다.
        html += g.hasGpt ? pill("GPT 업무 반영됨", "good")
          : (g.auto ? pill("GPT 업무 미반영", "warn") : "");
        html += "</div>";
        html += '<div class="wr-day-note">집계 대상은 <b>' + esc(workReportKind(g.primary).label) +
          '</b> 하나입니다. 나머지는 근거자료로 보관만 하며 중복 합산하지 않습니다.</div>';
        html += '<div class="blog-post-list">';
      g.list.forEach(function (r) {
        var kind = workReportKind(r);
        html += '<div class="blog-post-card' + (r === g.primary ? " wr-primary" : " wr-ref") + '">';
        var sub = [];
        if (r.author) sub.push("작성 " + esc(r.author));
        if (r.revision) sub.push("rev " + esc(String(r.revision)));
        if (r.sourceFormat) sub.push({ gdoc: "Google 문서", markdown: "Markdown", json: "JSON" }[r.sourceFormat] || r.sourceFormat);
        if (r.collectedAt) sub.push("수집 " + new Date(r.collectedAt).toLocaleString("ko-KR"));
        else if (r.generatedAt) sub.push(new Date(r.generatedAt).toLocaleString("ko-KR"));
        html += '<div class="blog-post-top"><div>' +
          '<div class="blog-post-title">' + pill(kind.label, r === g.primary ? "brand" : "neutral") +
            " " + pill(kind.note, r === g.primary ? "good" : "neutral") + "</div>" +
          (sub.length ? '<div class="wr-sub">' + sub.join(" · ") + "</div>" : "") +
          (r.sourceFile ? '<div class="wr-sub">원본: ' +
            (r.sourceUrl ? '<a href="' + esc(r.sourceUrl) + '" target="_blank" rel="noopener">' + esc(r.sourceFile) + " ↗</a>" : esc(r.sourceFile)) +
            "</div>" : "") + "</div>" +
          '<button class="icon-btn" data-del="workReport" data-id="' + r.id + '" aria-label="삭제">✕</button></div>';
        html += workReportBodyHtml(r);
        html += "</div>";
      });
        html += "</div></div>";
      });
    }

    document.getElementById("main").innerHTML = html;

    var wlBtn = document.getElementById("workLogSyncBtn");
    if (wlBtn) wlBtn.addEventListener("click", function () {
      wlBtn.disabled = true;
      wlBtn.textContent = "수집 중…";
      mergeWorkLogDocsIfNeeded(function () { render(); }, { notify: true });
    });

    document.getElementById("workReportForm").addEventListener("submit", function (e) {
      e.preventDefault();
      var fd = new FormData(e.target);
      var summary = (fd.get("summary") || "").toString().trim();
      if (!summary) return;
      state.workReports.push({ id: uid(), date: fd.get("date"), period: fd.get("period"), summary: summary,
        source: "manual", author: "안효준", createdAt: new Date().toISOString() });
      saveState(); toast("업무보고서가 저장되었습니다."); render();
    });

    Array.prototype.forEach.call(document.querySelectorAll('[data-del="workReport"]'), function (btn) {
      btn.addEventListener("click", function () {
        customConfirm("삭제하시겠습니까?", function () {
          state.workReports = state.workReports.filter(function (x) { return x.id !== btn.getAttribute("data-id"); });
          saveState(); toast("삭제되었습니다."); render();
        });
      });
    });
  }

  /* ---------------- Resources ---------------- */
  /* ---------------- Blog ---------------- */
  function blogStats() {
    var today = todayStr();
    var wk = weekRange();
    var mk = monthKey();
    var published = state.blogPosts.filter(function (p) { return p.status === "발행완료"; });
    return {
      todayCount: published.filter(function (p) { return p.date === today; }).length,
      weekCount: published.filter(function (p) { return p.date >= wk.start && p.date <= wk.end; }).length,
      monthCount: published.filter(function (p) { return p.date.slice(0, 7) === mk; }).length,
      total: state.blogPosts.length
    };
  }

  function blogPipelineEmployeeFor(status) {
    return BLOG_PIPELINE_EMPLOYEES.find(function (e) { return e.ownsStatus === status; }) || null;
  }

  var AI_OFFICE_KEYWORDS = ["아이디어", "정보검수", "작성", "SEO", "최종검토"];
  var AI_OFFICE_BG = ["--warn-bg", "--accent-soft", "--good-bg", "--brand-soft", "--neutral-bg"];

  function aiOfficeHomeHtml() {
    var today = todayStr();
    var lastRun = (state.blogAutomationLog || []).slice().sort(function (a, b) { return a.runAt < b.runAt ? 1 : -1; })[0];
    var ranToday = lastRun && lastRun.runAt && lastRun.runAt.slice(0, 10) === today;
    var extra = pill(ranToday ? "오늘 출근 완료" : "오늘 출근 전", ranToday ? "good" : "neutral") +
      '<button class="btn btn-ghost btn-sm" data-goto="team">👥 직원 · 근무일지 →</button>';
    var ev = aiWorkLogEvents();
    return officeSignHtml() + officeControlHtml(ev) +
      '<div class="home-stage section-gap">' + officeMapHtml(extra) +
      officeWindowsHtml(ev, "col") + "</div>";
  }

  function blogPipelineStripHtml() {
    var counts = {};
    state.blogPosts.forEach(function (p) { counts[p.status] = (counts[p.status] || 0) + 1; });
    var html = '<div class="pipe-strip">';
    BLOG_PIPELINE_EMPLOYEES.forEach(function (emp, idx) {
      var n = counts[emp.ownsStatus] || 0;
      var kind = n > 0 ? (emp.ownsStatus === "보류" ? "hold" : "busy") : "";
      html += '<div class="pipe-step ' + kind + '" title="' + esc(emp.desc) + '">';
      html += '<span class="pipe-no">' + (idx + 1) + "</span>";
      html += '<span class="pipe-txt"><b>' + esc(emp.ownsStatus) + "</b></span>";
      html += '<span class="pipe-n">' + n + "</span>";
      html += "</div>";
    });
    html += "</div>";
    return html;
  }

  function blogAutomationStatusHtml() {
    var log = (state.blogAutomationLog || []).slice().sort(function (a, b) { return a.runAt < b.runAt ? 1 : (a.runAt > b.runAt ? -1 : 0); });
    var last = log[0];

    var html = '<div class="card" style="margin-bottom:16px">';
    html += '<div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px">';
    html += '<div><strong>🤖 블로그 제작 파이프라인</strong><div class="sub" style="margin-top:2px">매일 08:00 자동 실행 · 글이 아래 순서로 넘어갑니다 (칸 안 숫자 = 그 단계에 머물러 있는 글)</div></div>';

    if (!last) {
      html += pill("아직 실행 기록 없음", "neutral");
    } else {
      var runAtMs = new Date(last.runAt).getTime();
      var hoursSince = (Date.now() - runAtMs) / 3600000;
      var stale = hoursSince > 36;
      var statusLabel = last.status === "success" ? "정상 실행" : last.status === "no_new" ? "새 소재 없음" : "오류 발생";
      var statusKind = last.status === "success" ? "good" : last.status === "no_new" ? "neutral" : "danger";
      if (stale) { statusLabel = "⚠ 실행 지연 (" + Math.floor(hoursSince / 24) + "일째 실행 안 됨)"; statusKind = "warn"; }
      html += '<div style="text-align:right">' + pill(statusLabel, statusKind);
      html += '<div class="sub" style="margin-top:4px">마지막 실행: ' + new Date(last.runAt).toLocaleString("ko-KR") +
        (last.addedCount != null ? " · " + last.addedCount + "건 처리" : "") + "</div></div>";
    }
    html += "</div>";

    if (last && last.note) {
      html += '<div class="sub" style="margin-top:8px;color:var(--danger)">' + esc(last.note) + "</div>";
    }

    html += blogPipelineStripHtml();

    if (log.length > 1) {
      html += '<details style="margin-top:10px"><summary style="cursor:pointer;color:var(--brand);font-size:13px">실행 기록 더보기 (' + log.length + '건)</summary>';
      html += '<div class="table-wrap" style="margin-top:8px"><table class="data-table"><thead><tr><th>실행 시각</th><th>결과</th><th>처리</th><th>메모</th></tr></thead><tbody>';
      log.forEach(function (l) {
        var lbl = l.status === "success" ? "정상" : l.status === "no_new" ? "새 소재 없음" : "오류";
        html += "<tr><td>" + new Date(l.runAt).toLocaleString("ko-KR") + "</td><td>" + lbl + "</td><td>" + (l.addedCount || 0) + "건</td><td class=\"memo-cell\">" + esc(l.note || "-") + "</td></tr>";
      });
      html += "</tbody></table></div></details>";
    }
    html += "</div>";
    return html;
  }

  function blogBodyPreviewHtml(body) {
    var text = body || "";
    var meta = "";
    var metaMatch = text.match(/^메타디스크립션:\s*([^\n]+)\n*/);
    if (metaMatch) { meta = metaMatch[1]; text = text.slice(metaMatch[0].length); }

    var blocks = text.split(/\n\n+/).map(function (b) { return b.trim(); }).filter(Boolean);
    var html = "";
    if (meta) html += '<div class="blog-preview-meta"><span class="lbl">메타 설명</span>' + esc(meta) + "</div>";

    var i = 0;
    while (i < blocks.length) {
      var b = blocks[i];
      if (b === "핵심 정리") {
        var summary = blocks[i + 1] || "";
        html += '<div class="blog-preview-summary"><h4>📌 핵심 정리</h4><div>' + esc(summary).replace(/\n/g, "<br>") + "</div></div>";
        i += 2;
        continue;
      }
      if (b === "자주 묻는 질문") {
        html += '<h4 class="blog-preview-h4">❓ 자주 묻는 질문</h4>';
        i++;
        while (i < blocks.length && blocks[i].indexOf("해시태그") !== 0 && blocks[i].indexOf("#") !== 0) {
          var lines = blocks[i].split("\n");
          if (lines.length >= 2) {
            html += '<div class="blog-preview-faq"><div class="q">' + esc(lines[0].replace(/^Q\.\s*/, "")) + '</div><div class="a">' + esc(lines.slice(1).join(" ").replace(/^A\.\s*/, "")) + "</div></div>";
          } else {
            html += "<p>" + esc(blocks[i]) + "</p>";
          }
          i++;
        }
        continue;
      }
      if (b.indexOf("해시태그") === 0 || b.indexOf("#") === 0) {
        var tagSource = b.replace(/^해시태그\n?/, "");
        var tags = tagSource.split(/\s+/).filter(function (t) { return t.indexOf("#") === 0; });
        if (tags.length) html += '<div class="blog-preview-tags">' + tags.map(function (t) { return pill(t, "brand"); }).join("") + "</div>";
        i++; continue;
      }
      var isHeading = b.length <= 60 && b.indexOf("\n") === -1 && /[?？]$/.test(b);
      if (isHeading) {
        html += '<h4 class="blog-preview-h4">' + esc(b) + "</h4>";
      } else if (i === 0) {
        html += '<p class="blog-preview-lead">' + esc(b) + "</p>";
      } else {
        html += "<p>" + esc(b).replace(/\n/g, "<br>") + "</p>";
      }
      i++;
    }
    return html || '<div class="empty-state">본문이 비어 있습니다.</div>';
  }

  function blogPreviewModalHtml(p) {
    var owner = blogPipelineEmployeeFor(p.status);
    var html = '<div class="blog-preview-overlay" id="blogPreviewOverlay"><div class="blog-preview-panel">';
    html += '<button class="blog-preview-close" id="blogPreviewCloseBtn" aria-label="닫기">✕</button>';
    html += '<div class="blog-preview-kicker">' + esc(p.topic || p.status) + (owner ? " · " + owner.icon + " " + esc(owner.name) : "") + "</div>";
    html += "<h2>" + esc(p.title) + "</h2>";
    html += '<div class="blog-preview-sub">' + formatShortDate(p.date) + " 작성 · " + esc(p.status) + "</div>";
    html += "<hr>";
    html += blogBodyPreviewHtml(p.body);
    html += "</div></div>";
    return html;
  }

  // 특정 블로그 상태(예: "아이디어")에 머물러 있는 글들을, 그 단계를 겸직하는 효제이 AI직원팀 담당 페이지에
  // 보여주기 위한 공용 섹션. 전체 CRUD/필터는 여전히 📝 블로그제작 담당(renderBlog)에서만 한다 —
  // 여기서는 "지금 내가 담당 중인 블로그 항목이 뭔지" 확인용으로 미리보기만 제공한다.
  function blogStageQueueSectionHtml(status, heading) {
    var items = state.blogPosts.filter(function (p) { return p.status === status; })
      .slice().sort(function (a, b) { return (b.updatedAt || b.createdAt || "").localeCompare(a.updatedAt || a.createdAt || ""); });
    if (!items.length) return "";
    var html = '<div class="section-gap"><div class="task-group-title">' + esc(heading) + " (" + items.length + "건)</div>";
    html += '<div class="blog-post-list">';
    items.forEach(function (p) {
      var statusKind = BLOG_STATUS_PILL[p.status] || "neutral";
      html += '<div class="blog-post-card status-' + statusKind + '">';
      html += '<div class="blog-post-top"><div><div class="blog-post-date">' + formatShortDate(p.date) + '</div><div class="blog-post-title">' + esc(p.title) + "</div></div>" + pill(p.status, statusKind) + "</div>";
      if (p.topic) html += '<div class="blog-post-tags">' + pill(p.topic, "brand") + "</div>";
      if (p.status === "보류" && p.holdReason) {
        html += '<div class="blog-post-hold"><strong>✅ 승인담당 보류 사유</strong><br>' + esc(p.holdReason) + "</div>";
      }
      html += '<div class="blog-post-footer">';
      if (p.body) html += '<button class="btn btn-ghost btn-sm" data-blog-preview="' + p.id + '">🔍 미리보기</button>';
      html += '<span class="sub">전체 관리는 📝 블로그제작 담당에서</span>';
      html += "</div></div>";
    });
    html += "</div></div>";
    return html;
  }

  // renderBlog 등 여러 페이지에서 공유하는 블로그 미리보기 모달 부착 로직. #main innerHTML을
  // 채운 뒤 마지막에 호출한다.
  function attachBlogPreviewIfAny() {
    var previewPost = blogPreviewId && state.blogPosts.find(function (x) { return x.id === blogPreviewId; });
    if (previewPost) {
      document.getElementById("main").insertAdjacentHTML("beforeend", blogPreviewModalHtml(previewPost));
      document.getElementById("blogPreviewCloseBtn").addEventListener("click", function () { blogPreviewId = null; render(); });
      document.getElementById("blogPreviewOverlay").addEventListener("click", function (e) {
        if (e.target.id === "blogPreviewOverlay") { blogPreviewId = null; render(); }
      });
    }
    Array.prototype.forEach.call(document.querySelectorAll("[data-blog-preview]"), function (btn) {
      btn.addEventListener("click", function () { blogPreviewId = btn.getAttribute("data-blog-preview"); render(); });
    });
  }

  function renderBlog() {
    var html = "";
    html += '<div class="page-head"><div><h1>블로그 업무</h1><div class="sub">부동산경매 · 부동산뉴스 관련 블로그 글 발행 현황을 하루 ' + BLOG_DAILY_GOAL + '회 목표로 관리합니다. 파이프라인 실행 현황·발행 KPI는 효제이 AI직원팀 화면에서 볼 수 있습니다.</div></div></div>';

    html += '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px">';
    html += '<button type="button" class="btn btn-ghost" id="blogAddToggleBtn">' + (blogAddFormOpen ? "− 새 글 작성 닫기" : "+ 새 블로그 아이디어/글 추가") + "</button>";
    html += '<button type="button" class="btn btn-ghost" id="blogTrashToggleBtn">' + (blogTrashOpen ? "− 휴지통 닫기" : "🗑 휴지통 (" + state.blogPostsTrash.length + ")") + "</button>";
    html += "</div>";

    if (blogTrashOpen) {
      html += '<div class="card section-gap"><h3>🗑 휴지통<span class="count">' + state.blogPostsTrash.length + "건</span></h3>";
      if (!state.blogPostsTrash.length) {
        html += '<div class="empty-state">휴지통이 비어 있습니다.</div>';
      } else {
        html += '<div class="blog-post-list">';
        state.blogPostsTrash.forEach(function (p) {
          html += '<div class="blog-post-card is-dimmed">';
          html += '<div class="blog-post-top"><div><div class="blog-post-date">' + formatShortDate(p.date) + '</div><div class="blog-post-title">' + esc(p.title) + "</div></div>" + pill(p.status || "-", BLOG_STATUS_PILL[p.status] || "neutral") + "</div>";
          html += '<div class="blog-post-memo">삭제됨: ' + new Date(p.deletedAt).toLocaleString("ko-KR") + "</div>";
          html += '<div class="blog-post-footer"><div class="row-actions">' +
            '<button class="btn btn-ghost btn-sm" data-blog-trash-restore="' + p.id + '">↩ 복원</button>' +
            '<button class="btn btn-danger-ghost btn-sm" data-blog-trash-purge="' + p.id + '">🗑 완전 삭제</button>' +
            "</div></div>";
          html += "</div>";
        });
        html += "</div>";
      }
      html += "</div>";
    }

    if (blogAddFormOpen) {
      html += '<form class="add-form" id="blogForm">';
      html += field("날짜", '<input type="date" name="date" value="' + todayStr() + '" required>');
      html += field("제목", '<input type="text" name="title" placeholder="예: 대구 아파트 경매 낙찰가율 하락, 지금 입찰해도 될까요" required>', "grow");
      html += field("주제/키워드", '<input type="text" name="topic" placeholder="예: 대구 경매, 낙찰가율">');
      html += field("상태", selectHtml("status", BLOG_STATUS, BLOG_STATUS[0]));
      html += field("발행 URL", '<input type="text" name="url" placeholder="https://blog.naver.com/...">', "grow");
      html += field("메모", '<input type="text" name="memo" placeholder="참고 기사, 해시태그 메모 등">', "grow");
      html += field("본문", '<textarea name="body" placeholder="글 본문 전체를 붙여넣으면 대시보드에서 바로 확인할 수 있어요" style="min-height:90px;width:100%"></textarea>', "grow");
      html += '<button type="submit" class="btn btn-primary">+ 글 추가</button>';
      html += "</form>";
    }

    html += '<div class="filter-bar">';
    html += '<input type="text" id="blogSearchInput" class="inline-select" placeholder="🔍 제목·본문·주제·메모 검색" value="' + esc(blogSearchQuery) + '" style="min-width:260px;flex:1">';
    html += "</div>";

    html += '<div class="filter-bar">';
    html += '<button class="filter-chip" data-blog-status-filter="all" aria-pressed="' + (blogFilterStatus === "all") + '">전체</button>';
    BLOG_STATUS.forEach(function (s) {
      html += '<button class="filter-chip" data-blog-status-filter="' + s + '" aria-pressed="' + (blogFilterStatus === s) + '">' + s + "</button>";
    });
    html += "</div>";

    var blogSearchNeedle = blogSearchQuery.trim().toLowerCase();
    var filtered = state.blogPosts.filter(function (p) {
      if (blogFilterStatus !== "all" && p.status !== blogFilterStatus) return false;
      if (blogSearchNeedle) {
        var haystack = [p.title, p.body, p.topic, p.memo].join(" ").toLowerCase();
        if (haystack.indexOf(blogSearchNeedle) === -1) return false;
      }
      return true;
    }).slice().sort(function (a, b) { return b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt); })
      .sort(function (a, b) { return (a.status === "발행완료" ? 1 : 0) - (b.status === "발행완료" ? 1 : 0); });

    if (filtered.length === 0) {
      html += '<div class="empty-state">' + (blogSearchNeedle ? "검색 결과가 없습니다." : "등록된 블로그 글이 없습니다. 위 버튼으로 추가해보세요.") + "</div>";
    } else {
      html += '<div class="blog-post-list">';
      filtered.forEach(function (p) {
        var isOpen = !!blogExpandedIds[p.id];
        var statusKind = BLOG_STATUS_PILL[p.status] || "neutral";
        var dimClass = p.status === "발행완료" ? " is-dimmed" : "";
        html += '<div class="blog-post-card status-' + statusKind + dimClass + '">';
        html += '<div class="blog-post-top">';
        html += '<div><div class="blog-post-date">' + formatShortDate(p.date) + '</div><div class="blog-post-title">' + esc(p.title) + "</div></div>";
        html += "<div>" + selectHtml("status", BLOG_STATUS, p.status, p.id, "blog") + "</div>";
        html += "</div>";

        var tags = "";
        if (p.topic) tags += pill(p.topic, "brand");
        if (p.url) tags += '<a href="' + esc(p.url) + '" target="_blank" rel="noopener" class="pill pill-good">🔗 발행 글 열기</a>';
        if (tags) html += '<div class="blog-post-tags">' + tags + "</div>";

        if (p.memo) html += '<div class="blog-post-memo">' + esc(p.memo) + "</div>";

        var owner = blogPipelineEmployeeFor(p.status);
        if (owner) html += '<div class="blog-post-owner">담당: ' + owner.icon + " " + esc(owner.name) + "</div>";

        if (p.status === "보류") {
          if (p.holdReason) {
            html += '<div class="blog-post-hold"><strong>✅ 승인담당 보류 사유</strong><br>' + esc(p.holdReason) + "</div>";
          } else {
            html += '<div class="blog-post-hold"><strong>✋ 직접 보류로 설정하셨습니다</strong><br>수정할 내용을 아래에 남겨주시면 재검수를 요청할 수 있습니다.</div>';
          }
          if (p.revisionRequestedAt) {
            html += '<div class="blog-post-revision-pending">🔄 재검수 요청됨 (' + new Date(p.revisionRequestedAt).toLocaleString("ko-KR") + ') — 최대 1시간 이내 AI 직원들이 자동으로 다시 처리합니다. 급하시면 채팅으로 "확인해줘"라고 말씀해주세요.';
            if (p.revisionNote) html += '<div class="sub" style="margin-top:6px">전달하신 수정사항: ' + esc(p.revisionNote) + "</div>";
            html += "</div>";
          } else {
            html += '<div class="blog-post-revision-form">';
            html += '<textarea data-blog-revision-note="' + p.id + '" placeholder="어떤 부분이 바뀌었는지 적어주세요 (예: 정식 공고 뜸, 임차인 없음 확인됨 등)" style="width:100%;min-height:60px;margin-top:8px"></textarea>';
            html += '<button class="btn btn-primary btn-sm" data-blog-revision-submit="' + p.id + '" style="margin-top:6px">🔄 수정사항 반영해서 재검수 요청</button>';
            html += "</div>";
          }
        }

        if (p.stageLog && p.stageLog.length) {
          html += '<details class="blog-post-stagelog"><summary>처리 이력 보기 (' + p.stageLog.length + '단계)</summary>';
          html += '<div style="margin-top:6px">';
          p.stageLog.forEach(function (l) {
            html += '<div class="blog-stagelog-row"><span class="who">' + esc(l.by || l.stage || "") + '</span><span class="note">' + esc(l.note || "") + '</span>' +
              (l.at ? '<span class="at">' + new Date(l.at).toLocaleString("ko-KR") + "</span>" : "") + "</div>";
          });
          html += "</div></details>";
        }

        // 발행대기 글은 대리님이 네이버에 올린 뒤 바로 "발행 완료"를 누를 수 있게 큰 버튼을 둔다(자동 대조가 제목 차이로 놓치는 일이 있어서).
        if (p.status === "발행대기") {
          html += '<div class="blog-publish-row"><button class="btn btn-primary btn-sm" data-blog-mark-published="' + p.id + '">✅ 네이버에 올렸어요 → 발행 완료</button><span class="meta">올린 뒤 누르면 발행완료로 바뀌고 KPI에 잡힙니다</span></div>';
        } else if (p.status === "발행완료" && !p.url) {
          html += '<div class="blog-publish-row"><input type="url" data-blog-url-edit="' + p.id + '" placeholder="게시한 네이버 글 주소를 붙여넣으면 카드에 링크가 생깁니다"><button class="btn btn-ghost btn-sm" data-blog-url-save="' + p.id + '">주소 저장</button></div>';
        }
        html += '<div class="blog-post-footer">';
        if (p.body) html += '<button class="btn btn-ghost btn-sm" data-blog-preview="' + p.id + '">🔍 미리보기</button>';
        html += "<button class=\"btn btn-ghost btn-sm\" data-blog-toggle-body=\"" + p.id + "\">" + (isOpen ? "본문 숨기기 ▴" : (p.body ? "본문 수정 ▾" : "+ 본문 작성")) + "</button>";
        html += '<button class="icon-btn" data-del="blog" data-id="' + p.id + '" aria-label="삭제">✕</button>';
        html += "</div>";

        if (isOpen) {
          html += '<div style="margin-top:10px;padding-top:10px;border-top:1px solid var(--border)">';
          html += '<textarea data-blog-body-edit="' + p.id + '" style="width:100%;min-height:160px;white-space:pre-wrap">' + esc(p.body || "") + "</textarea>";
          html += '<div style="margin-top:8px"><button class="btn btn-primary btn-sm" data-blog-body-save="' + p.id + '">본문 저장</button></div>';
          html += "</div>";
        }
        html += "</div>";
      });
      html += "</div>";
    }

    document.getElementById("main").innerHTML = html;
    attachBlogPreviewIfAny();

    document.getElementById("blogAddToggleBtn").addEventListener("click", function () {
      blogAddFormOpen = !blogAddFormOpen;
      render();
    });

    document.getElementById("blogTrashToggleBtn").addEventListener("click", function () {
      blogTrashOpen = !blogTrashOpen;
      render();
    });

    Array.prototype.forEach.call(document.querySelectorAll("[data-blog-trash-restore]"), function (btn) {
      btn.addEventListener("click", function () {
        var id = btn.getAttribute("data-blog-trash-restore");
        var idx = state.blogPostsTrash.findIndex(function (x) { return x.id === id; });
        if (idx === -1) return;
        var restored = state.blogPostsTrash.splice(idx, 1)[0];
        delete restored.deletedAt;
        state.blogPosts.push(restored);
        saveState(); toast("복원되었습니다."); render();
      });
    });

    Array.prototype.forEach.call(document.querySelectorAll("[data-blog-trash-purge]"), function (btn) {
      btn.addEventListener("click", function () {
        var id = btn.getAttribute("data-blog-trash-purge");
        customConfirm("완전히 삭제하시겠습니까? 복구할 수 없습니다.", function () {
          state.blogPostsTrash = state.blogPostsTrash.filter(function (x) { return x.id !== id; });
          saveState(); toast("완전히 삭제되었습니다."); render();
        });
      });
    });

    if (blogAddFormOpen) {
      document.getElementById("blogForm").addEventListener("submit", function (e) {
        e.preventDefault();
        var fd = new FormData(e.target);
        var title = (fd.get("title") || "").toString().trim();
        if (!title) return;
        state.blogPosts.push({
          id: uid(), date: fd.get("date"), title: title, topic: (fd.get("topic") || "").toString(),
          status: fd.get("status"), url: (fd.get("url") || "").toString(), memo: (fd.get("memo") || "").toString(),
          body: (fd.get("body") || "").toString(),
          createdAt: new Date().toISOString()
        });
        blogAddFormOpen = false;
        saveState(); toast("블로그 글이 추가되었습니다."); render();
      });
    }

    Array.prototype.forEach.call(document.querySelectorAll("[data-blog-toggle-body]"), function (btn) {
      btn.addEventListener("click", function () {
        var id = btn.getAttribute("data-blog-toggle-body");
        blogExpandedIds[id] = !blogExpandedIds[id];
        render();
      });
    });
    Array.prototype.forEach.call(document.querySelectorAll("[data-blog-body-save]"), function (btn) {
      btn.addEventListener("click", function () {
        var id = btn.getAttribute("data-blog-body-save");
        var p = state.blogPosts.find(function (x) { return x.id === id; });
        var ta = document.querySelector('[data-blog-body-edit="' + id + '"]');
        if (!p || !ta) return;
        p.body = ta.value;
        saveState(); toast("본문을 저장했습니다."); render();
      });
    });

    Array.prototype.forEach.call(document.querySelectorAll("[data-blog-mark-published]"), function (btn) {
      btn.addEventListener("click", function () {
        var id = btn.getAttribute("data-blog-mark-published");
        var post = state.blogPosts.find(function (x) { return x.id === id; });
        if (!post) return;
        post.status = "발행완료";
        post.publishedAt = todayStr();
        post.stageLog = post.stageLog || [];
        post.stageLog.push({ stage: "발행완료", by: "안효준 대리", at: new Date().toISOString(), note: "대시보드에서 발행 완료 표시" });
        saveState();
        toast("발행완료로 표시했습니다. 글 주소를 붙여넣으면 링크가 생깁니다.");
        render();
      });
    });
    Array.prototype.forEach.call(document.querySelectorAll("[data-blog-url-save]"), function (btn) {
      btn.addEventListener("click", function () {
        var id = btn.getAttribute("data-blog-url-save");
        var input = document.querySelector('[data-blog-url-edit="' + id + '"]');
        var post = state.blogPosts.find(function (x) { return x.id === id; });
        if (!post || !input) return;
        var url = (input.value || "").trim();
        if (!/^https?:\/\//.test(url)) { toast("http로 시작하는 주소를 넣어주세요."); return; }
        post.url = url;
        saveState();
        toast("글 주소를 저장했습니다.");
        render();
      });
    });
    Array.prototype.forEach.call(document.querySelectorAll("[data-blog-status-filter]"), function (btn) {
      btn.addEventListener("click", function () { blogFilterStatus = btn.getAttribute("data-blog-status-filter"); render(); });
    });

    Array.prototype.forEach.call(document.querySelectorAll("[data-blog-revision-submit]"), function (btn) {
      btn.addEventListener("click", function () {
        var id = btn.getAttribute("data-blog-revision-submit");
        var ta = document.querySelector('[data-blog-revision-note="' + id + '"]');
        var note = ta ? ta.value.trim() : "";
        if (!note) { toast("어떤 부분이 바뀌었는지 적어주세요."); return; }
        submitBlogRevisionRequest(id, note);
      });
    });

    var blogSearchEl = document.getElementById("blogSearchInput");
    if (blogSearchEl) {
      var blogSearchComposing = false;
      var blogSearchDebounceTimer = null;
      var runBlogSearch = function () {
        blogSearchQuery = blogSearchEl.value;
        var cursorPos = blogSearchEl.selectionStart;
        render();
        var newSearchEl = document.getElementById("blogSearchInput");
        if (newSearchEl) { newSearchEl.focus(); newSearchEl.setSelectionRange(cursorPos, cursorPos); }
      };
      var scheduleBlogSearch = function () {
        if (blogSearchDebounceTimer) clearTimeout(blogSearchDebounceTimer);
        blogSearchDebounceTimer = setTimeout(runBlogSearch, 250);
      };
      blogSearchEl.addEventListener("compositionstart", function () {
        blogSearchComposing = true;
        if (blogSearchDebounceTimer) { clearTimeout(blogSearchDebounceTimer); blogSearchDebounceTimer = null; }
      });
      blogSearchEl.addEventListener("compositionend", function () { blogSearchComposing = false; scheduleBlogSearch(); });
      blogSearchEl.addEventListener("input", function (e) {
        if (blogSearchComposing || (e && e.isComposing)) return;
        scheduleBlogSearch();
      });
    }

    bindTableCommon("blog");
  }

  /* ---------------- Bank transactions ---------------- */
  function parseAmount(v) {
    if (v == null || v === "") return 0;
    if (typeof v === "number") return Math.round(v);
    var s = String(v).replace(/[^0-9.-]/g, "");
    if (!s || s === "-") return 0;
    var n = Number(s);
    return isNaN(n) ? 0 : Math.round(n);
  }
  function previousBalanceFor(date) {
    var withBal = state.transactions.filter(function (t) {
      return t.balance != null && (!date || t.date <= date);
    });
    if (!withBal.length) return null;
    var maxDate = withBal.reduce(function (m, t) { return t.date > m ? t.date : m; }, withBal[0].date);
    // 은행에서 내려받은 거래내역은 같은 날짜 안에서 최신 거래가 배열 앞쪽에 오므로(최신순),
    // 같은 날짜가 여러 건이면 그중 배열에서 가장 먼저 나오는 것이 실제로 가장 최근 거래다.
    var candidates = withBal.filter(function (t) { return t.date === maxDate; });
    return candidates[0].balance;
  }
  function normalizeDateStr(v) {
    if (v instanceof Date && !isNaN(v.getTime())) {
      return v.getFullYear() + "-" + pad2(v.getMonth() + 1) + "-" + pad2(v.getDate());
    }
    var s = String(v == null ? "" : v).trim();
    var m = s.match(/^(\d{4})[-.\/](\d{1,2})[-.\/](\d{1,2})/);
    if (m) return m[1] + "-" + pad2(parseInt(m[2], 10)) + "-" + pad2(parseInt(m[3], 10));
    m = s.match(/^(\d{4})(\d{2})(\d{2})/);
    if (m) return m[1] + "-" + m[2] + "-" + m[3];
    m = s.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2}|\d{4})$/);
    if (m) {
      var yy = m[3].length === 2 ? (parseInt(m[3], 10) + 2000) : parseInt(m[3], 10);
      return yy + "-" + pad2(parseInt(m[1], 10)) + "-" + pad2(parseInt(m[2], 10));
    }
    return null;
  }
  function formatCellPreview(v) {
    if (v instanceof Date && !isNaN(v.getTime())) return normalizeDateStr(v);
    return v == null ? "" : v;
  }
  function decodeCsvBuffer(buf) {
    try { return new TextDecoder("utf-8", { fatal: true }).decode(buf); }
    catch (e) {
      try { return new TextDecoder("euc-kr").decode(buf); }
      catch (e2) { return new TextDecoder("utf-8").decode(buf); }
    }
  }
  function detectHeaderRow(rows) {
    var limit = Math.min(rows.length, 15);
    for (var i = 0; i < limit; i++) {
      var row = (rows[i] || []).map(function (c) { return String(c == null ? "" : c).trim(); });
      var score = 0;
      Object.keys(BANK_HEADER_KEYWORDS).forEach(function (key) {
        var hit = row.some(function (cell) {
          return BANK_HEADER_KEYWORDS[key].some(function (kw) { return cell.indexOf(kw) !== -1; });
        });
        if (hit) score++;
      });
      if (score >= 3) return i;
    }
    return -1;
  }
  function autoMapColumns(headerRow) {
    var cells = (headerRow || []).map(function (c) { return String(c == null ? "" : c).trim(); });
    var roles = cells.map(function () { return "ignore"; });
    Object.keys(BANK_HEADER_KEYWORDS).forEach(function (key) {
      var keywords = BANK_HEADER_KEYWORDS[key];
      for (var k = 0; k < keywords.length; k++) {
        var found = -1;
        for (var i = 0; i < cells.length; i++) {
          if (roles[i] === "ignore" && cells[i].indexOf(keywords[k]) !== -1) { found = i; break; }
        }
        if (found !== -1) { roles[found] = key; break; }
      }
    });
    return roles;
  }

  function parseHtmlTableToRows(html) {
    var doc = new DOMParser().parseFromString(html, "text/html");
    var table = doc.querySelector("table");
    if (!table) return [];
    var rows = [];
    Array.prototype.forEach.call(table.querySelectorAll("tr"), function (tr) {
      var cells = tr.querySelectorAll("td,th");
      if (!cells.length) return;
      var row = [];
      Array.prototype.forEach.call(cells, function (cell) {
        row.push(cell.textContent.replace(/\s+/g, " ").trim());
      });
      rows.push(row);
    });
    return rows;
  }

  function looksLikeHtml(text) {
    return /<html[\s>]|<table[\s>]|<!doctype html/i.test(text.slice(0, 4000));
  }

  function readBankFile(file) {
    var ext = (file.name.split(".").pop() || "").toLowerCase();
    if (file.size === 0) { toast("빈 파일입니다. 파일을 다시 확인해주세요.", 4000); return; }
    var reader = new FileReader();
    reader.onerror = function () {
      toast("파일을 읽지 못했습니다. 다시 시도해주세요.", 4000);
    };
    reader.onload = function () {
      var rows = null;
      var lastErr = null;
      if (ext === "csv" || ext === "txt") {
        try {
          var text = decodeCsvBuffer(reader.result);
          var workbook = XLSX.read(text, { type: "string", cellDates: true });
          rows = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { header: 1, raw: true, defval: "" });
        } catch (err) { lastErr = err; }
      } else {
        try {
          var workbook2 = XLSX.read(reader.result, { type: "array", cellDates: true });
          rows = XLSX.utils.sheet_to_json(workbook2.Sheets[workbook2.SheetNames[0]], { header: 1, raw: true, defval: "" });
        } catch (err2) {
          lastErr = err2;
          try {
            var text2 = decodeCsvBuffer(reader.result);
            if (looksLikeHtml(text2)) rows = parseHtmlTableToRows(text2);
          } catch (err3) { lastErr = err3; }
        }
      }
      if (!rows || !rows.length) {
        console.error("은행 거래내역 파일 파싱 실패:", lastErr);
        toast("파일을 읽지 못했습니다. 손상되었거나 지원하지 않는 형식일 수 있어요. 엑셀에서 '다른 이름으로 저장 → CSV'로 다시 내보내 시도해보세요.", 5000);
        return;
      }
      var headerIdx = detectHeaderRow(rows);
      if (headerIdx === -1) headerIdx = 0;
      pendingImport = {
        fileName: file.name,
        rows: rows,
        headerRowIndex: headerIdx,
        colRoles: autoMapColumns(rows[headerIdx]),
        dataStartRow: headerIdx + 1
      };
      render();
    };
    reader.readAsArrayBuffer(file);
  }

  function revertTuitionLink(stId, instId) {
    if (!stId) return;
    var st = state.students.find(function (x) { return x.id === stId; });
    if (!st) return;
    if (instId) {
      var stillLinked = state.transactions.some(function (x) {
        return x.installmentId === instId || (x.studentLinks || []).some(function (l) { return l.installmentId === instId; });
      });
      if (!stillLinked) {
        var inst = (st.installments || []).find(function (i) { return i.id === instId; });
        if (inst) inst.paid = false;
      }
    } else {
      var stillLinkedFlat = state.transactions.some(function (x) {
        return (x.studentId === stId && !x.installmentId && x.category === "tuition") ||
          (x.studentLinks || []).some(function (l) { return l.studentId === stId && !l.installmentId; });
      });
      if (!stillLinkedFlat) { st.paid = false; st.paidDate = null; }
    }
  }

  function unpaidCandidatesFor(t) {
    var list = [];
    state.students.forEach(function (s) {
      if (s.paymentType === "월별") {
        var next = studentNextUnpaidInstallment(s);
        if (next) {
          list.push({ student: s, installment: next, amount: Number(next.amount) || 0 });
        } else {
          // 월별 학생인데 아직 회차가 하나도 없는 경우(예: 수강생 DB에서 막 연동된 학생) --
          // 다음 회차를 미리 만들어두지 않아도 바로 매칭할 수 있도록 가상의 다음 회차를 후보로 제시
          var nextRound = (s.installments || []).length + 1;
          list.push({ student: s, installment: null, virtualRound: nextRound, amount: Number(s.monthlyAmount) || 0 });
        }
      } else {
        // 이미 입금완료로 표시된 단발성 학생도 검색해서 다시 연결할 수 있어야 한다
        // (중복입금 정정, 추가결제 태깅 등) -- alreadyPaid로만 구분해서 목록에 계속 남겨둔다.
        list.push({ student: s, installment: null, amount: Number(s.tuition) || 0, alreadyPaid: !!s.paid });
      }
    });
    return list;
  }

  function suggestStudentFor(t) {
    if (!(t.deposit > 0)) return null;
    var candidates = unpaidCandidatesFor(t).filter(function (c) { return !c.alreadyPaid; });
    var amtMatches = candidates.filter(function (c) { return c.amount === t.deposit; });
    if (amtMatches.length === 1) return amtMatches[0];
    var nameMatches = candidates.filter(function (c) { return c.student.name && t.description && t.description.indexOf(c.student.name) !== -1; });
    if (nameMatches.length === 1) return nameMatches[0];
    if (nameMatches.length > 1) {
      var both = nameMatches.filter(function (c) { return c.amount === t.deposit; });
      if (both.length === 1) return both[0];
    }
    return null;
  }

  function isAdSpend(t) {
    if (!(t.withdrawal > 0)) return false;
    var desc = t.description || "";
    return AD_SPEND_KEYWORDS.some(function (kw) { return desc.indexOf(kw) !== -1; });
  }
  function monthlyBankStats() {
    var map = {};
    state.transactions.forEach(function (t) {
      var mk = t.date.slice(0, 7);
      if (!map[mk]) map[mk] = { deposit: 0, withdrawal: 0, count: 0, tuition: 0, consulting: 0, capital: 0, general: 0, adSpend: 0, reimburse: 0, advance: 0 };
      map[mk].deposit += t.deposit;
      map[mk].withdrawal += t.withdrawal;
      map[mk].count++;
      if (t.category === "tuition") map[mk].tuition += t.deposit;
      if (t.category === "consulting") map[mk].consulting += t.deposit;
      if (t.category === "capital") map[mk].capital += t.deposit;
      if (t.category === "general") map[mk].general += t.deposit;
      if (isReimburseDeposit(t)) map[mk].reimburse += t.deposit;
      if (isAdvanceSpend(t)) map[mk].advance += t.withdrawal;
      if (isAdSpend(t)) map[mk].adSpend += t.withdrawal;
    });
    return map;
  }
  function adSpendItemsFor(mk) {
    return state.transactions.filter(function (t) { return t.date.slice(0, 7) === mk && isAdSpend(t); })
      .sort(function (a, b) { return a.date.localeCompare(b.date); });
  }

  // 이미 분류된 출금 내역의 적요(description)를 근거로, 같은 적요의 미분류 출금건을 자동 분류한다.
  // 같은 적요가 서로 다른 분류로 나뉜 적(애매한 경우)이 있으면 그 적요는 자동분류 대상에서 제외하고 수동 분류로 남긴다.
  function autoClassifyExpenseCategories() {
    var descToCategory = {};
    var ambiguous = {};
    state.transactions.forEach(function (t) {
      if (!(t.withdrawal > 0) || !t.expenseCategory || !t.description) return;
      // 입체금(대납)은 "그날 그 자리" 의 성격이지 가게의 성격이 아니다. 같은 식당·카페를 다음에 회사 돈으로 쓸 수 있으니
      // 적요 학습에서 뺀다 — 안 그러면 공차·닭갈비집 결제가 앞으로 전부 비용에서 빠져 버린다.
      if (t.expenseCategory === "edu_advance") return;
      var key = t.description.trim();
      if (!key) return;
      if (descToCategory.hasOwnProperty(key) && descToCategory[key] !== t.expenseCategory) {
        ambiguous[key] = true;
        return;
      }
      descToCategory[key] = t.expenseCategory;
    });
    var changed = 0;
    state.transactions.forEach(function (t) {
      if (!(t.withdrawal > 0) || t.expenseCategory || !t.description) return;
      var key = t.description.trim();
      if (!key) return;
      if (!ambiguous[key] && descToCategory.hasOwnProperty(key)) {
        t.expenseCategory = descToCategory[key];
        t.expenseCategoryAuto = true;
        changed++;
        return;
      }
      var descLower = key.toLowerCase();
      var rule = EXPENSE_KEYWORD_RULES.find(function (r) { return descLower.indexOf(r.keyword) !== -1; });
      if (rule) {
        t.expenseCategory = rule.category;
        t.expenseCategoryAuto = true;
        changed++;
      }
    });
    return changed;
  }

  function autoDetectCardPayments() {
    var changed = 0;
    state.transactions.forEach(function (t) {
      if (!(t.deposit > 0) || !t.description || t.cardPayment !== undefined) return;
      if (CARD_SETTLEMENT_PATTERN.test(t.description.trim())) {
        t.cardPayment = true;
        t.cardPaymentAuto = true;
        changed++;
      }
    });
    changed += autoLinkCardSettlements();
    return changed;
  }

  // 카드사 정산 입금(수수료가 빠진 금액)을 카드 결제로 등록된 학생과 자동으로 연결한다.
  // 조건: 학생이 카드결제(cardPayment)·단발성·아직 수강료 거래가 연결되지 않음, 정산액이 수강료의 95~100%,
  // 결제일(또는 신청일)과 정산일이 3주 이내. 후보가 정확히 1명일 때만 연결하고, 여럿이면 손대지 않는다
  // (홈의 "미확정 입금" 경고로 남아 대리님이 직접 고른다). 연결 시 수강료는 실제 정산 입금액으로 맞춘다(기존 관행).
  // AUG5_BULK_IMPORT_STUDENT_IDS 는 아래쪽에서 선언되므로(호이스팅으로 초기엔 undefined) 초기 로딩 중에도 안전하게 읽는다.
  function bulkImportIds() { return (typeof AUG5_BULK_IMPORT_STUDENT_IDS !== "undefined" && AUG5_BULK_IMPORT_STUDENT_IDS) || []; }
  function autoLinkCardSettlements() {
    var linkedIds = {};
    state.transactions.forEach(function (t) { if (t.studentId && t.category === "tuition") linkedIds[t.studentId] = true; });
    var names = [];
    state.transactions.forEach(function (t) {
      if (!(t.deposit > 0) || !t.cardPayment || t.studentId) return;
      var cands = state.students.filter(function (st) {
        if (bulkImportIds().indexOf(st.id) !== -1) return false;
        if (!st.cardPayment || st.paymentType === "월별" || linkedIds[st.id]) return false;
        var list = Number(st.tuition) || 0;
        if (!(list > 0) || t.deposit > list || t.deposit < list * 0.95) return false;
        var ref = st.paidDate || st.appliedDate;
        if (ref && Math.abs(daysBetween(ref, t.date)) > 21) return false;
        return true;
      });
      if (cands.length !== 1) return;
      var st = cands[0];
      t.studentId = st.id; t.category = "tuition"; t.installmentId = null;
      if (!st.paid) st.paid = true;
      if (!st.paidDate) st.paidDate = t.date;
      if (t.deposit !== Number(st.tuition)) {
        st.memo = (st.memo ? st.memo + " · " : "") + "카드 정산 " + won(Number(st.tuition)) + "→" + won(t.deposit);
        st.tuition = t.deposit;
      }
      linkedIds[st.id] = true;
      names.push(st.name);
    });
    if (names.length) notifySync("☁ 카드 정산 입금 " + names.length + "건을 자동 연결했습니다: " + names.join(", "));
    return names.length;
  }

  function computeExpenseCategoryTotals(list) {
    var totals = { all: { count: 0, amount: 0 }, unclassified: { count: 0, amount: 0 } };
    EXPENSE_CATEGORIES.forEach(function (c) { totals[c] = { count: 0, amount: 0 }; });
    list.forEach(function (t) {
      if (!(t.withdrawal > 0)) return;
      totals.all.count++; totals.all.amount += t.withdrawal;
      if (t.expenseCategory && totals[t.expenseCategory]) {
        totals[t.expenseCategory].count++; totals[t.expenseCategory].amount += t.withdrawal;
      } else {
        totals.unclassified.count++; totals.unclassified.amount += t.withdrawal;
      }
    });
    return totals;
  }

  function shortCategoryLabel(key) {
    var label = key === "unclassified" ? "미분류" : EXPENSE_CATEGORY_LABELS[key];
    var idx = label.indexOf(" (");
    return idx > -1 ? label.slice(0, idx) : label;
  }

  function monthlyExpenseCategoryBreakdown() {
    var byMonth = {};
    state.transactions.forEach(function (t) {
      if (!(t.withdrawal > 0)) return;
      var mk = t.date.slice(0, 7);
      if (!byMonth[mk]) byMonth[mk] = {};
      var cat = t.expenseCategory || "unclassified";
      byMonth[mk][cat] = (byMonth[mk][cat] || 0) + t.withdrawal;
    });
    return byMonth;
  }

  // 대리님이 "월별로 합계를 알고싶다"고 요청해서, 필터칩에 금액을 끼워넣는 대신
  // 월 × 분류 표 형태로 따로 깔끔하게 정리해서 보여준다. 값이 전혀 없는 분류 열은 생략한다.
  function renderExpenseMonthlyBreakdown() {
    var byMonth = monthlyExpenseCategoryBreakdown();
    var monthKeys = Object.keys(byMonth).sort().reverse();
    if (!monthKeys.length) return "";
    var allCats = EXPENSE_CATEGORIES.concat(["unclassified"]);
    var activeCats = allCats.filter(function (c) {
      return monthKeys.some(function (mk) { return (byMonth[mk][c] || 0) > 0; });
    });
    if (!activeCats.length) return "";

    // 전체 합계는 접힌 상태에서도 요약으로 보여줘야 하니 표와 별개로 먼저 계산해둔다.
    var grand = {}, grandTotal = 0;
    monthKeys.forEach(function (mk) {
      activeCats.forEach(function (c) {
        var amt = byMonth[mk][c] || 0;
        grand[c] = (grand[c] || 0) + amt;
        grandTotal += amt;
      });
    });

    var html = '<div class="expense-monthly-card">';
    html += '<button type="button" class="expense-monthly-head" id="expenseMonthlyToggleBtn" aria-expanded="' + expenseMonthlyOpen + '">';
    html += '<span>📊 월별 출금 분류 합계</span>';
    html += '<span class="expense-monthly-head-right">';
    if (!expenseMonthlyOpen) html += '<span class="expense-monthly-summary">총 ' + won(grandTotal) + ' · ' + monthKeys.length + "개월</span>";
    html += '<span class="expense-monthly-chevron">' + (expenseMonthlyOpen ? "▲" : "▼") + "</span>";
    html += "</span></button>";

    if (expenseMonthlyOpen) {
      html += '<div class="table-wrap"><table class="expense-monthly-table"><thead><tr><th>월</th>';
      activeCats.forEach(function (c) {
        var full = c === "unclassified" ? "미분류" : EXPENSE_CATEGORY_LABELS[c];
        html += '<th title="' + esc(full) + '">' + esc(shortCategoryLabel(c)) + "</th>";
      });
      html += "<th>합계</th></tr></thead><tbody>";

      monthKeys.forEach(function (mk) {
        var rowTotal = 0;
        html += "<tr><td>" + esc(monthLabel(mk)) + "</td>";
        activeCats.forEach(function (c) {
          var amt = byMonth[mk][c] || 0;
          rowTotal += amt;
          html += '<td class="num">' + (amt ? won(amt) : "-") + "</td>";
        });
        html += '<td class="num expense-monthly-rowtotal">' + won(rowTotal) + "</td></tr>";
      });

      html += '<tr class="expense-monthly-total-row"><td>합계</td>';
      activeCats.forEach(function (c) {
        html += '<td class="num">' + won(grand[c] || 0) + "</td>";
      });
      html += '<td class="num">' + won(grandTotal) + "</td></tr>";
      html += "</tbody></table></div>";
    }
    html += "</div>";
    return html;
  }

  function renderBank() {
    var html = "";
    html += '<div class="page-head"><div><h1>은행 거래내역</h1><div class="sub">우리은행 법인통장 입출금내역을 업로드해 월별 현황과 수강료 입금 여부를 관리합니다</div></div></div>';

    html += '<div class="bank-drop">';
    html += '<label class="file-label btn btn-primary" for="bankFile">📄 입출금내역 파일 업로드</label>';
    html += '<input type="file" id="bankFile" accept=".xlsx,.xls,.csv,.txt">';
    html += '<div class="hint">엑셀(.xlsx/.xls) 또는 CSV 파일을 지원합니다. 겹치는 기간을 다시 올려도 중복 거래는 자동으로 제외됩니다.</div>';
    html += "</div>";

    html += '<form class="add-form" id="manualTxForm">';
    html += field("날짜", '<input type="date" name="date" value="' + todayStr() + '" required>');
    html += field("적요", '<input type="text" name="description" placeholder="예: 수강료입금, 사무용품몰">', "grow");
    html += field("입금액(원)", '<input type="number" name="deposit" min="0" step="1" placeholder="0">');
    html += field("출금액(원)", '<input type="number" name="withdrawal" min="0" step="1" placeholder="0">');
    html += field("잔액(원, 자동계산)", '<input type="number" name="balance" step="1" placeholder="이전 잔액 없음 - 직접 입력" id="manualTxBalance">');
    html += '<button type="submit" class="btn btn-primary">+ 거래 수기 입력</button>';
    html += "</form>";

    document.getElementById("main").innerHTML = html;

    document.getElementById("bankFile").addEventListener("change", function (e) {
      var file = e.target.files[0];
      if (file) readBankFile(file);
      e.target.value = "";
    });

    (function () {
      var form = document.getElementById("manualTxForm");
      var dateInp = form.querySelector('[name="date"]');
      var depInp = form.querySelector('[name="deposit"]');
      var wdInp = form.querySelector('[name="withdrawal"]');
      var balInp = form.querySelector('[name="balance"]');
      function recalcBalance() {
        var prev = previousBalanceFor(normalizeDateStr(dateInp.value));
        if (prev == null) { balInp.placeholder = "이전 잔액 없음 - 직접 입력"; return; }
        balInp.value = prev + parseAmount(depInp.value) - parseAmount(wdInp.value);
      }
      dateInp.addEventListener("change", recalcBalance);
      depInp.addEventListener("input", recalcBalance);
      wdInp.addEventListener("input", recalcBalance);
      recalcBalance();
    })();

    document.getElementById("manualTxForm").addEventListener("submit", function (e) {
      e.preventDefault();
      var fd = new FormData(e.target);
      var date = normalizeDateStr(fd.get("date"));
      if (!date) { toast("날짜를 입력해주세요."); return; }
      var desc = (fd.get("description") || "").toString().trim();
      var dep = parseAmount(fd.get("deposit"));
      var wd = parseAmount(fd.get("withdrawal"));
      var balRaw = (fd.get("balance") || "").toString().trim();
      var bal = balRaw === "" ? null : parseAmount(balRaw);
      if (dep === 0 && wd === 0) { toast("입금액 또는 출금액 중 하나는 입력해주세요."); return; }
      var sig = date + "|" + desc + "|" + dep + "|" + wd + "|" + (bal == null ? "" : bal);
      var addTx = function () {
        state.transactions.unshift({
          id: uid(), sig: sig, date: date, description: desc, deposit: dep, withdrawal: wd, balance: bal,
          studentId: null, category: null
        });
        autoClassifyExpenseCategories();
        autoDetectCardPayments();
        saveState();
        toast("거래내역을 추가했습니다.");
        e.target.reset();
        render();
      };
      if (state.transactions.some(function (t) { return t.sig === sig; })) {
        // 잔액을 안 적으면 날짜·적요·금액이 같은 서로 다른 실제 거래도 signature가
        // 같아질 수 있어, 무조건 막지 않고 확인 후 등록할 수 있게 한다.
        customConfirm("날짜·적요·금액이 같은 거래내역이 이미 있습니다.\n동일 거래를 두 번 입력하는 것이면 취소해주세요.\n\n그래도 새로 등록하시겠습니까?", addTx);
        return;
      }
      addTx();
    });

    if (pendingImport) {
      renderImportMapping();
      return;
    }

    renderBankList();
  }

  function renderImportMapping() {
    var main = document.getElementById("main");
    var rows = pendingImport.rows;
    var headerIdx = pendingImport.headerRowIndex;
    var previewRows = rows.slice(headerIdx, headerIdx + 6);
    var numCols = Math.max.apply(null, previewRows.map(function (r) { return r.length; }).concat([1]));

    var html = '<div class="card">';
    html += "<h3>열 매핑 확인 · " + esc(pendingImport.fileName) + "</h3>";
    html += '<div class="mapping-hint">파일에서 자동으로 인식한 열 구성입니다. 실제와 다르면 각 열 위의 선택 상자에서 직접 지정해주세요.</div>';
    html += '<div class="field" style="margin-bottom:12px"><label>헤더(제목) 행 번호</label><input type="number" id="headerRowInput" min="1" max="' + rows.length + '" value="' + (headerIdx + 1) + '" style="width:80px"></div>';

    html += '<div class="table-wrap"><table class="data-table"><thead><tr>';
    for (var c = 0; c < numCols; c++) {
      html += "<th><select class=\"inline-select\" data-colrole=\"" + c + "\">" + roleOptionsHtml(pendingImport.colRoles[c]) + "</select></th>";
    }
    html += "</tr></thead><tbody>";
    previewRows.forEach(function (r, ri) {
      html += "<tr" + (ri === 0 ? ' style="font-weight:700;background:var(--surface-2)"' : "") + ">";
      for (var c2 = 0; c2 < numCols; c2++) html += "<td>" + esc(formatCellPreview(r[c2])) + "</td>";
      html += "</tr>";
    });
    html += "</tbody></table></div>";

    html += '<div class="field" style="margin-top:14px"><label>데이터 시작 행 번호</label><input type="number" id="dataStartInput" min="1" max="' + (rows.length + 1) + '" value="' + (pendingImport.dataStartRow + 1) + '" style="width:80px"></div>';
    html += '<div class="backup-actions"><button class="btn btn-primary" id="confirmImportBtn">이 매핑으로 가져오기</button><button class="btn btn-ghost" id="cancelImportBtn">취소</button></div>';
    html += "</div>";

    main.innerHTML = html;

    Array.prototype.forEach.call(main.querySelectorAll("[data-colrole]"), function (sel) {
      sel.addEventListener("change", function () {
        pendingImport.colRoles[Number(sel.getAttribute("data-colrole"))] = sel.value;
      });
    });
    document.getElementById("headerRowInput").addEventListener("change", function (ev) {
      var idx = Math.max(1, Math.min(rows.length, Number(ev.target.value) || 1)) - 1;
      pendingImport.headerRowIndex = idx;
      pendingImport.colRoles = autoMapColumns(rows[idx]);
      pendingImport.dataStartRow = idx + 1;
      renderImportMapping();
    });
    document.getElementById("dataStartInput").addEventListener("change", function (ev) {
      pendingImport.dataStartRow = Math.max(0, (Number(ev.target.value) || 1) - 1);
    });
    document.getElementById("confirmImportBtn").addEventListener("click", finalizeImport);
    document.getElementById("cancelImportBtn").addEventListener("click", function () { pendingImport = null; render(); });
  }

  function roleOptionsHtml(current) {
    return ["ignore", "date", "description", "deposit", "withdrawal", "balance"].map(function (r) {
      return '<option value="' + r + '"' + (r === current ? " selected" : "") + ">" + BANK_ROLE_LABELS[r] + "</option>";
    }).join("");
  }

  function finalizeImport() {
    var colRoles = pendingImport.colRoles;
    var roleCol = {};
    colRoles.forEach(function (role, idx) { if (role !== "ignore" && roleCol[role] === undefined) roleCol[role] = idx; });
    if (roleCol.date === undefined || (roleCol.deposit === undefined && roleCol.withdrawal === undefined)) {
      toast("날짜와 입금액 또는 출금액 열을 지정해주세요.");
      return;
    }
    var rows = pendingImport.rows;
    // 잔액 컬럼이 없는 파일은 같은 날짜·적요·금액의 서로 다른 실제 거래가 signature가
    // 같아질 수 있다. boolean 대신 개수를 세어, 이미 저장된 만큼만 "재업로드 중복"으로
    // 건너뛰고 그 이상 나오는 동일 signature는 새 거래로 취급한다.
    var existingSigCounts = {};
    state.transactions.forEach(function (t) { existingSigCounts[t.sig] = (existingSigCounts[t.sig] || 0) + 1; });
    var added = 0, skipped = 0;
    for (var i = pendingImport.dataStartRow; i < rows.length; i++) {
      var r = rows[i];
      if (!r || r.every(function (c) { return String(c == null ? "" : c).trim() === ""; })) continue;
      var date = normalizeDateStr(r[roleCol.date]);
      if (!date) { skipped++; continue; }
      var desc = roleCol.description !== undefined ? String(r[roleCol.description] == null ? "" : r[roleCol.description]).trim() : "";
      var dep = roleCol.deposit !== undefined ? parseAmount(r[roleCol.deposit]) : 0;
      var wd = roleCol.withdrawal !== undefined ? parseAmount(r[roleCol.withdrawal]) : 0;
      var bal = roleCol.balance !== undefined ? parseAmount(r[roleCol.balance]) : null;
      if (dep === 0 && wd === 0) { skipped++; continue; }
      var sig = date + "|" + desc + "|" + dep + "|" + wd + "|" + (bal == null ? "" : bal);
      if (existingSigCounts[sig] > 0) { existingSigCounts[sig]--; skipped++; continue; }
      state.transactions.push({
        id: uid(), sig: sig, date: date, description: desc, deposit: dep, withdrawal: wd, balance: bal,
        studentId: null, category: null
      });
      added++;
    }
    if (added) { autoClassifyExpenseCategories(); autoDetectCardPayments(); }
    saveState();
    pendingImport = null;
    toast(added + "건 가져옴" + (skipped ? " · " + skipped + "건 제외" : ""));
    render();
  }

  // 수강생 대납 정산 현황 — 회사카드 대납(입체금)과 수강생 n분의 1 회수(정산입금)를 달별로 짝지어 보여준다.
  function renderSettlementCard() {
    var stats = settlementStats();
    var keys = Object.keys(stats).sort().reverse();
    if (!keys.length) return "";
    var html = '<div class="card section-gap"><h3>🤝 수강생 대납 정산<span class="count">' + keys.length + "개월</span></h3>";
    html += '<div class="hint" style="margin-bottom:8px">임장·회식 때 회사카드로 결제한 뒤 수강생이 돌려준 돈. 회수액은 매출에서 빠지고, 결제액과의 차액만 순이익에 들어간다 — 덜 걷힌 만큼은 대리님·대표님 식대(회사 몫, 복리후생비), 더 걷혔으면 잡이익. 출금은 지출 분류 "입체금", 입금은 "정산입금" 으로 표시하면 여기에 묶인다.</div>';
    keys.forEach(function (mk) {
      var st = stats[mk];
      var diff = st.reimburse - st.advance;
      var note = diff === 0 ? pill("수강생 몫 전액 회수", "good")
        : diff < 0 ? pill("회사 몫 " + won(-diff) + " · 비용 처리", "neutral")
        : pill("초과 회수 " + won(diff) + " · 잡이익", "accent");
      html += '<div class="list-row"><span class="txt">' + esc(monthLabel(mk)) + ' <span class="meta">대납 ' + st.advanceCount + "건 " + won(st.advance) + " → 회수 " + st.reimburseCount + "건 " + won(st.reimburse) + "</span></span><span>" + note + "</span></div>";
    });
    html += "</div>";
    return html;
  }

  function renderBankList() {
    var main = document.getElementById("main");
    var stats = monthlyBankStats();
    var monthKeys = Object.keys(stats).sort().reverse();

    var extra = "";
    extra += '<div class="month-scroller">';
    extra += '<div class="month-card" data-month-select="all" aria-pressed="' + (bankFilterMonth === "all") + '"><div class="m">전체</div><div class="row"><span class="l">거래</span><span>' + state.transactions.length + "건</span></div></div>";
    monthKeys.forEach(function (mk) {
      var st = stats[mk];
      extra += '<div class="month-card" data-month-select="' + mk + '" aria-pressed="' + (bankFilterMonth === mk) + '">';
      extra += '<div class="m">' + esc(monthLabel(mk)) + "</div>";
      extra += '<div class="row"><span class="l">입금</span><span class="v in">' + won(st.deposit) + "</span></div>";
      extra += '<div class="row"><span class="l">출금</span><span class="v out">' + won(st.withdrawal) + "</span></div>";
      extra += '<div class="row"><span class="l">수강료</span><span>' + won(st.tuition) + "</span></div>";
      extra += '<div class="row"><span class="l">컨설팅입금</span><span>' + won(st.consulting) + "</span></div>";
      extra += '<div class="row"><span class="l">출자금</span><span>' + won(st.capital) + "</span></div>";
      if ((st.reimburse || 0) > 0) extra += '<div class="row"><span class="l">정산입금</span><span>' + won(st.reimburse) + "</span></div>";
      extra += "</div>";
    });
    extra += "</div>";
    extra += renderSettlementCard();

    if (state.transactions.length === 0) {
      extra += '<div class="empty-state">등록된 거래내역이 없습니다. 위에서 파일을 올리거나 직접 입력해보세요.</div>';
      main.insertAdjacentHTML("beforeend", extra);
      return;
    }

    extra += renderExpenseMonthlyBreakdown();

    extra += '<div class="filter-bar">';
    extra += '<input type="text" id="bankSearchInput" class="inline-select" placeholder="🔍 적요·금액 검색" value="' + esc(bankSearchQuery) + '" style="min-width:260px;flex:1">';
    extra += "</div>";

    extra += '<div class="filter-bar">';
    [["all", "전체"], ["deposit", "입금"], ["withdrawal", "출금"]].forEach(function (p) {
      extra += '<button class="filter-chip" data-type-filter="' + p[0] + '" aria-pressed="' + (bankFilterType === p[0]) + '">' + p[1] + "</button>";
    });
    extra += "</div>";
    extra += '<div class="filter-bar">';
    [["all", "전체 상태"], ["confirmed", "수강료 확정"], ["consulting", "컨설팅입금"], ["capital", "출자금"], ["pending", "미확정 입금"], ["general", "일반입금"], ["reimburse", "정산입금(대납)"], ["cashReceiptPending", "⚠ 현금영수증 미발행"]].forEach(function (p) {
      extra += '<button class="filter-chip" data-status-filter="' + p[0] + '" aria-pressed="' + (bankFilterStatus === p[0]) + '">' + p[1] + "</button>";
    });
    extra += '<button class="btn btn-danger-ghost btn-sm" id="resetTxBtn" style="margin-left:auto">거래내역 전체 삭제</button>';
    extra += "</div>";
    var bankSearchNeedle = bankSearchQuery.trim().toLowerCase();
    var baseFiltered = state.transactions.filter(function (t) {
      if (bankFilterMonth !== "all" && t.date.slice(0, 7) !== bankFilterMonth) return false;
      if (bankFilterType === "deposit" && !(t.deposit > 0)) return false;
      if (bankFilterType === "withdrawal" && !(t.withdrawal > 0)) return false;
      if (bankFilterStatus !== "all") {
        if (bankFilterStatus === "confirmed" && !(t.category === "tuition" && t.studentId)) return false;
        if (bankFilterStatus === "consulting" && t.category !== "consulting") return false;
        if (bankFilterStatus === "capital" && t.category !== "capital") return false;
        if (bankFilterStatus === "pending" && !(t.deposit > 0 && !t.category)) return false;
        if (bankFilterStatus === "general" && t.category !== "general") return false;
        if (bankFilterStatus === "reimburse" && t.category !== "reimburse") return false;
        if (bankFilterStatus === "cashReceiptPending" && !(t.category === "tuition" && t.studentId && !t.cardPayment && !t.cashReceiptIssued)) return false;
      }
      if (bankSearchNeedle) {
        var haystack = [t.description, t.date, t.deposit, t.withdrawal, t.balance].join(" ").toLowerCase();
        if (haystack.indexOf(bankSearchNeedle) === -1) return false;
      }
      return true;
    });
    var expenseTotals = computeExpenseCategoryTotals(baseFiltered);

    // 분류 종류가 많아질수록 칩을 한 줄씩 늘어놓으면 지저분해지므로, 드롭다운 하나로 정리한다.
    extra += '<div class="filter-bar">';
    extra += '<span class="filter-bar-label">출금 분류</span>';
    extra += '<select id="expenseFilterSelect" class="inline-select">';
    extra += '<option value="all"' + (bankFilterExpense === "all" ? " selected" : "") + ">전체</option>";
    EXPENSE_CATEGORIES.forEach(function (c) {
      extra += '<option value="' + c + '"' + (bankFilterExpense === c ? " selected" : "") + ">" + esc(EXPENSE_CATEGORY_LABELS[c]) + "</option>";
    });
    extra += '<option value="unclassified"' + (bankFilterExpense === "unclassified" ? " selected" : "") + ">⚠ 미분류만</option>";
    extra += "</select>";
    extra += "</div>";
    if (bankFilterExpense !== "all") {
      var selTotal = expenseTotals[bankFilterExpense] || expenseTotals.unclassified;
      var selLabel = bankFilterExpense === "unclassified" ? "미분류" : EXPENSE_CATEGORY_LABELS[bankFilterExpense];
      extra += '<div class="expense-total-banner">' + esc(selLabel) + " 합계 · <strong>" + won(selTotal.amount) + "</strong> (" + selTotal.count + "건)</div>";
    }

    var filtered = baseFiltered.filter(function (t) {
      if (bankFilterExpense !== "all") {
        if (bankFilterExpense === "unclassified") { if (!(t.withdrawal > 0) || t.expenseCategory) return false; }
        else if (!(t.withdrawal > 0) || t.expenseCategory !== bankFilterExpense) return false;
      }
      return true;
    }).sort(function (a, b) { return b.date.localeCompare(a.date); });

    extra += '<div class="table-wrap"><table class="data-table"><thead><tr><th>날짜</th><th>적요</th><th>입금액</th><th>출금액</th><th>잔액</th><th>처리 · 분류</th><th></th></tr></thead><tbody>';
    if (filtered.length === 0) {
      extra += '<tr><td colspan="7"><div class="empty-state">조건에 맞는 거래내역이 없습니다.</div></td></tr>';
    } else {
      filtered.forEach(function (t) {
        extra += "<tr>";
        extra += "<td>" + formatShortDate(t.date) + "</td>";
        extra += '<td class="memo-cell">' + esc(t.description || "-") + "</td>";
        extra += '<td class="num">' + (t.deposit > 0 ? won(t.deposit) : "-") + "</td>";
        extra += '<td class="num">' + (t.withdrawal > 0 ? won(t.withdrawal) : "-") + "</td>";
        extra += '<td class="num">' + (t.balance != null ? won(t.balance) : "-") + "</td>";
        extra += "<td>" + depositActionHtml(t) + "</td>";
        extra += '<td><div class="row-actions"><button class="icon-btn" data-del-tx="' + t.id + '" aria-label="삭제">✕</button></div></td>';
        extra += "</tr>";
      });
    }
    extra += "</tbody></table></div>";

    main.insertAdjacentHTML("beforeend", extra);

    Array.prototype.forEach.call(main.querySelectorAll("[data-month-select]"), function (el) {
      el.addEventListener("click", function () { bankFilterMonth = el.getAttribute("data-month-select"); render(); });
    });
    var bankSearchEl = main.querySelector("#bankSearchInput");
    if (bankSearchEl) {
      var bankSearchComposing = false;
      var bankSearchDebounceTimer = null;
      var runBankSearch = function () {
        bankSearchQuery = bankSearchEl.value;
        var cursorPos = bankSearchEl.selectionStart;
        render();
        var newSearchEl = document.getElementById("bankSearchInput");
        if (newSearchEl) { newSearchEl.focus(); newSearchEl.setSelectionRange(cursorPos, cursorPos); }
      };
      var scheduleBankSearch = function () {
        if (bankSearchDebounceTimer) clearTimeout(bankSearchDebounceTimer);
        bankSearchDebounceTimer = setTimeout(runBankSearch, 250);
      };
      bankSearchEl.addEventListener("compositionstart", function () {
        bankSearchComposing = true;
        if (bankSearchDebounceTimer) { clearTimeout(bankSearchDebounceTimer); bankSearchDebounceTimer = null; }
      });
      bankSearchEl.addEventListener("compositionend", function () { bankSearchComposing = false; scheduleBankSearch(); });
      bankSearchEl.addEventListener("input", function (e) {
        if (bankSearchComposing || (e && e.isComposing)) return;
        scheduleBankSearch();
      });
    }
    Array.prototype.forEach.call(main.querySelectorAll("[data-type-filter]"), function (btn) {
      btn.addEventListener("click", function () { bankFilterType = btn.getAttribute("data-type-filter"); render(); });
    });
    Array.prototype.forEach.call(main.querySelectorAll("[data-status-filter]"), function (btn) {
      btn.addEventListener("click", function () { bankFilterStatus = btn.getAttribute("data-status-filter"); render(); });
    });
    var expenseFilterSelect = document.getElementById("expenseFilterSelect");
    if (expenseFilterSelect) expenseFilterSelect.addEventListener("change", function () {
      bankFilterExpense = expenseFilterSelect.value; render();
    });
    Array.prototype.forEach.call(main.querySelectorAll("[data-expense-category]"), function (sel) {
      sel.addEventListener("change", function () {
        var t = state.transactions.find(function (x) { return x.id === sel.getAttribute("data-expense-category"); });
        if (!t) return;
        t.expenseCategory = sel.value || null;
        t.expenseCategoryAuto = false;
        if (t.expenseCategory) autoClassifyExpenseCategories();
        saveState(); render();
      });
    });
    Array.prototype.forEach.call(main.querySelectorAll("[data-cashreceipt-toggle]"), function (cb) {
      cb.addEventListener("change", function () {
        var t = state.transactions.find(function (x) { return x.id === cb.getAttribute("data-cashreceipt-toggle"); });
        if (!t) return;
        t.cashReceiptIssued = cb.checked;
        saveState(); render();
      });
    });
    Array.prototype.forEach.call(main.querySelectorAll("[data-cardpayment-toggle]"), function (cb) {
      cb.addEventListener("change", function () {
        var t = state.transactions.find(function (x) { return x.id === cb.getAttribute("data-cardpayment-toggle"); });
        if (!t) return;
        t.cardPayment = cb.checked;
        t.cardPaymentAuto = false;
        if (t.cardPayment) t.cashReceiptIssued = false;
        saveState(); render();
      });
    });
    var resetBtn = document.getElementById("resetTxBtn");
    if (resetBtn) resetBtn.addEventListener("click", function () {
      customConfirm("업로드된 모든 거래내역을 삭제합니다. 계속할까요?", function () {
        state.transactions = []; saveState(); toast("거래내역이 삭제되었습니다."); render();
      });
    });
    var expenseMonthlyToggleBtn = document.getElementById("expenseMonthlyToggleBtn");
    if (expenseMonthlyToggleBtn) expenseMonthlyToggleBtn.addEventListener("click", function () {
      expenseMonthlyOpen = !expenseMonthlyOpen;
      render();
    });

    Array.prototype.forEach.call(main.querySelectorAll("[data-confirm-select]"), function (btn) {
      btn.addEventListener("click", function () {
        var txId = btn.getAttribute("data-confirm-select");
        var sel = main.querySelector('[data-link-select="' + txId + '"]');
        var raw = sel ? sel.value : "";
        if (!raw) { toast("연결할 수강생을 선택해주세요."); return; }
        var parts = raw.split("::");
        var studentId = parts[0], installmentId = parts[1] || "";
        var t = state.transactions.find(function (x) { return x.id === txId; });
        var st = state.students.find(function (x) { return x.id === studentId; });
        if (!t || !st) return;
        if (installmentId === "NEW") {
          st.installments = st.installments || [];
          var newInst = { id: uid(), round: st.installments.length + 1, month: monthKey(), amount: st.monthlyAmount || 0, paid: true, taxInvoice: false, cardPayment: false };
          st.installments.push(newInst);
          installmentId = newInst.id;
        } else if (installmentId) {
          var inst = (st.installments || []).find(function (i) { return i.id === installmentId; });
          if (inst) inst.paid = true;
        } else {
          st.paid = true; st.paidDate = t.date;
        }
        t.studentId = studentId; t.category = "tuition"; t.installmentId = installmentId || null;
        saveState(); toast("수강료 입금으로 확정했습니다."); render();
      });
    });
    Array.prototype.forEach.call(main.querySelectorAll("[data-add-student-confirm]"), function (btn) {
      btn.addEventListener("click", function () {
        var txId = btn.getAttribute("data-add-student-confirm");
        var nameInput = main.querySelector('[data-new-student-name="' + txId + '"]');
        var name = nameInput ? nameInput.value.trim() : "";
        if (!name) { toast("추가할 수강생 이름을 입력해주세요."); return; }
        var t = state.transactions.find(function (x) { return x.id === txId; });
        if (!t) return;
        var courses = {};
        Array.prototype.forEach.call(main.querySelectorAll('[data-new-student-course][data-tx-id="' + txId + '"]:checked'), function (cb) {
          courses[cb.getAttribute("data-new-student-course")] = true;
        });
        var addAndLink = function () {
          var newId = uid();
          var dbId = uid();
          state.studentDb.push({
            id: dbId, name: name, phone: null, registeredDate: t.date, courses: courses,
            amount: t.deposit, courseType: null, classTime: null,
            paymentStatus: "입금완료", paymentDate: t.date,
            cashReceipt: null, memo: "은행 거래내역에서 자동 등록", linkedStudentId: newId
          });
          state.students.push({
            id: newId, name: name, level: STUDENT_LEVELS[0], appliedDate: t.date,
            status: "등록완료", paymentType: "단발성",
            tuition: t.deposit, paid: true, paidDate: t.date, taxInvoice: false, cardPayment: false,
            monthlyAmount: 0, installments: [], memo: "", studentDbId: dbId
          });
          t.studentId = newId; t.category = "tuition"; t.installmentId = null;
          saveState(); toast(name + "님을 수강생 DB에 등록하고 입금 건에 연결했습니다."); render();
        };
        var dup = findStudentDbByName(name);
        if (dup) {
          customConfirm(name + "님은 이미 수강생 DB에 등록되어 있습니다" + (dup.registeredDate ? " (등록일 " + formatShortDate(dup.registeredDate) + ")" : "") + ".\n동일인이면 취소 후 위 검색창에서 기존 항목을 찾아 연결해주세요.\n\n그래도 새로 등록하시겠습니까?", addAndLink);
        } else {
          addAndLink();
        }
      });
    });
    Array.prototype.forEach.call(main.querySelectorAll("[data-mark-consulting]"), function (btn) {
      btn.addEventListener("click", function () {
        var t = state.transactions.find(function (x) { return x.id === btn.getAttribute("data-mark-consulting"); });
        if (!t) return;
        t.category = "consulting"; t.studentId = null;
        saveState(); toast("컨설팅입금으로 표시했습니다."); render();
      });
    });
    Array.prototype.forEach.call(main.querySelectorAll("[data-mark-capital]"), function (btn) {
      btn.addEventListener("click", function () {
        var t = state.transactions.find(function (x) { return x.id === btn.getAttribute("data-mark-capital"); });
        if (!t) return;
        t.category = "capital"; t.studentId = null;
        saveState(); toast("출자금으로 표시했습니다."); render();
      });
    });
    Array.prototype.forEach.call(main.querySelectorAll("[data-mark-general]"), function (btn) {
      btn.addEventListener("click", function () {
        var t = state.transactions.find(function (x) { return x.id === btn.getAttribute("data-mark-general"); });
        if (!t) return;
        t.category = "general"; t.studentId = null;
        saveState(); render();
      });
    });
    Array.prototype.forEach.call(main.querySelectorAll("[data-mark-reimburse]"), function (btn) {
      btn.addEventListener("click", function () {
        var t = state.transactions.find(function (x) { return x.id === btn.getAttribute("data-mark-reimburse"); });
        if (!t) return;
        t.category = "reimburse"; t.studentId = null;
        saveState(); toast("정산입금(대납 회수)으로 표시했습니다. 매출에서 빠집니다."); render();
      });
    });
    Array.prototype.forEach.call(main.querySelectorAll("[data-undo-tx]"), function (btn) {
      btn.addEventListener("click", function () {
        var t = state.transactions.find(function (x) { return x.id === btn.getAttribute("data-undo-tx"); });
        if (!t) return;
        t.category = null;
        saveState(); render();
      });
    });
    Array.prototype.forEach.call(main.querySelectorAll("[data-unlink-tx]"), function (btn) {
      btn.addEventListener("click", function () {
        var t = state.transactions.find(function (x) { return x.id === btn.getAttribute("data-unlink-tx"); });
        if (!t) return;
        var links = (t.studentLinks && t.studentLinks.length) ? t.studentLinks.slice() : [{ studentId: t.studentId, installmentId: t.installmentId }];
        t.studentId = null; t.category = null; t.installmentId = null; t.studentLinks = null;
        delete bankMultiSelectPending[t.id];
        delete bankMultiDetailsOpen[t.id];
        links.forEach(function (l) { revertTuitionLink(l.studentId, l.installmentId); });
        saveState(); render();
      });
    });
    Array.prototype.forEach.call(main.querySelectorAll("[data-single-search]"), function (inp) {
      var txId = inp.getAttribute("data-single-search");
      var list = main.querySelector('[data-single-list="' + txId + '"]');
      var sel = main.querySelector('[data-link-select="' + txId + '"]');
      if (!list || !sel) return;
      function showList() { list.style.display = "block"; }
      function hideList() { list.style.display = "none"; }
      inp.addEventListener("focus", showList);
      inp.addEventListener("input", function () {
        var q = inp.value.trim().toLowerCase();
        showList();
        Array.prototype.forEach.call(list.querySelectorAll(".single-select-item"), function (item) {
          var name = (item.getAttribute("data-name") || "").toLowerCase();
          item.style.display = !q || name.indexOf(q) !== -1 ? "block" : "none";
        });
      });
      inp.addEventListener("blur", function () { setTimeout(hideList, 150); });
      Array.prototype.forEach.call(list.querySelectorAll("[data-single-pick]"), function (item) {
        item.addEventListener("mousedown", function (e) {
          e.preventDefault();
          sel.value = item.getAttribute("data-value");
          inp.value = item.getAttribute("data-name");
          hideList();
        });
      });
    });
    Array.prototype.forEach.call(main.querySelectorAll("[data-multi-search]"), function (inp) {
      inp.addEventListener("input", function () {
        var q = inp.value.trim().toLowerCase();
        var list = main.querySelector('[data-multi-list="' + inp.getAttribute("data-multi-search") + '"]');
        if (!list) return;
        Array.prototype.forEach.call(list.querySelectorAll(".multi-select-item"), function (label) {
          var name = (label.getAttribute("data-name") || "").toLowerCase();
          label.style.display = !q || name.indexOf(q) !== -1 ? "flex" : "none";
        });
      });
    });
    Array.prototype.forEach.call(main.querySelectorAll("[data-multi-select]"), function (cb) {
      cb.addEventListener("change", function () {
        var txId = cb.getAttribute("data-multi-select");
        bankMultiSelectPending[txId] = bankMultiSelectPending[txId] || {};
        if (cb.checked) bankMultiSelectPending[txId][cb.value] = true;
        else delete bankMultiSelectPending[txId][cb.value];
      });
    });
    Array.prototype.forEach.call(main.querySelectorAll("[data-multi-details]"), function (det) {
      det.addEventListener("toggle", function () {
        bankMultiDetailsOpen[det.getAttribute("data-multi-details")] = det.open;
      });
    });
    Array.prototype.forEach.call(main.querySelectorAll("[data-multi-add-student]"), function (btn) {
      btn.addEventListener("click", function () {
        var txId = btn.getAttribute("data-multi-add-student");
        var nameInput = main.querySelector('[data-multi-new-student-name="' + txId + '"]');
        var name = nameInput ? nameInput.value.trim() : "";
        if (!name) { toast("추가할 수강생 이름을 입력해주세요."); return; }
        var t = state.transactions.find(function (x) { return x.id === txId; });
        if (!t) return;
        var courses = {};
        Array.prototype.forEach.call(main.querySelectorAll('[data-multi-new-student-course][data-tx-id="' + txId + '"]:checked'), function (cb) {
          courses[cb.getAttribute("data-multi-new-student-course")] = true;
        });
        var addAndStage = function () {
          var newId = uid();
          var dbId = uid();
          state.studentDb.push({
            id: dbId, name: name, phone: null, registeredDate: t.date, courses: courses,
            amount: null, courseType: null, classTime: null,
            paymentStatus: null, paymentDate: null,
            cashReceipt: null, memo: "은행 거래내역에서 자동 등록", linkedStudentId: newId
          });
          state.students.push({
            id: newId, name: name, level: STUDENT_LEVELS[0], appliedDate: t.date,
            status: "등록완료", paymentType: "단발성",
            tuition: 0, paid: false, taxInvoice: false, cardPayment: false,
            monthlyAmount: 0, installments: [], memo: "", studentDbId: dbId
          });
          bankMultiSelectPending[txId] = bankMultiSelectPending[txId] || {};
          bankMultiSelectPending[txId][newId + "::"] = true;
          bankMultiDetailsOpen[txId] = true;
          saveState(); toast(name + "님을 수강생 DB에 등록했습니다. 목록에서 확인 후 확정해주세요."); render();
        };
        var dup = findStudentDbByName(name);
        if (dup) {
          customConfirm(name + "님은 이미 수강생 DB에 등록되어 있습니다" + (dup.registeredDate ? " (등록일 " + formatShortDate(dup.registeredDate) + ")" : "") + ".\n동일인이면 취소 후 위 목록에서 기존 항목을 체크해주세요.\n\n그래도 새로 등록하시겠습니까?", addAndStage);
        } else {
          addAndStage();
        }
      });
    });
    Array.prototype.forEach.call(main.querySelectorAll("[data-confirm-multi]"), function (btn) {
      btn.addEventListener("click", function () {
        var txId = btn.getAttribute("data-confirm-multi");
        var checked = main.querySelectorAll('[data-multi-select="' + txId + '"]:checked');
        if (!checked.length) { toast("연결할 수강생을 한 명 이상 선택해주세요."); return; }
        var t = state.transactions.find(function (x) { return x.id === txId; });
        if (!t) return;
        var links = [];
        Array.prototype.forEach.call(checked, function (cb) {
          var parts = cb.value.split("::");
          var studentId = parts[0], installmentId = parts[1] || "";
          var st = state.students.find(function (x) { return x.id === studentId; });
          if (!st) return;
          if (installmentId === "NEW") {
            st.installments = st.installments || [];
            var newInst = { id: uid(), round: st.installments.length + 1, month: monthKey(), amount: st.monthlyAmount || 0, paid: true, taxInvoice: false, cardPayment: false };
            st.installments.push(newInst);
            installmentId = newInst.id;
          } else if (installmentId) {
            var inst = (st.installments || []).find(function (i) { return i.id === installmentId; });
            if (inst) inst.paid = true;
          } else {
            st.paid = true; st.paidDate = t.date;
          }
          links.push({ studentId: studentId, installmentId: installmentId || null });
        });
        if (!links.length) return;
        t.studentLinks = links; t.category = "tuition"; t.studentId = null; t.installmentId = null;
        delete bankMultiSelectPending[txId];
        delete bankMultiDetailsOpen[txId];
        saveState(); toast(links.length + "명 확정했습니다."); render();
      });
    });
    Array.prototype.forEach.call(main.querySelectorAll("[data-del-tx]"), function (btn) {
      btn.addEventListener("click", function () {
        customConfirm("이 거래내역을 삭제하시겠습니까?", function () {
          state.transactions = state.transactions.filter(function (x) { return x.id !== btn.getAttribute("data-del-tx"); });
          saveState(); toast("삭제되었습니다."); render();
        });
      });
    });
  }

  function withdrawalExpenseHtml(t) {
    var opts = '<option value=""' + (!t.expenseCategory ? " selected" : "") + '>미분류</option>';
    EXPENSE_CATEGORIES.forEach(function (c) {
      opts += '<option value="' + c + '"' + (t.expenseCategory === c ? " selected" : "") + '>' + EXPENSE_CATEGORY_LABELS[c] + "</option>";
    });
    var badge = t.expenseCategory
      ? pill(EXPENSE_CATEGORY_LABELS[t.expenseCategory] + (t.expenseCategoryAuto ? " · 자동" : ""), EXPENSE_CATEGORY_PILL[t.expenseCategory]) + " "
      : "";
    return badge + '<select class="inline-select" data-expense-category="' + t.id + '">' + opts + "</select>";
  }

  function depositActionHtml(t) {
    if (!(t.deposit > 0)) return withdrawalExpenseHtml(t);
    var dupNamesStudents = buildDupNameMap(state.students);
    if (t.category === "tuition" && t.studentLinks && t.studentLinks.length) {
      var names = t.studentLinks.map(function (l) {
        var s = state.students.find(function (x) { return x.id === l.studentId; });
        return s ? (dupNamesStudents[s.id] || s.name) : "?";
      });
      return pill("수강료 확정 (" + t.studentLinks.length + "명)", "good") +
        ' <span class="meta">→ ' + names.map(esc).join(", ") + "</span>" +
        ' <button class="btn btn-ghost btn-sm" data-unlink-tx="' + t.id + '">해제</button>';
    }
    if (t.category === "tuition" && t.studentId) {
      var st = state.students.find(function (s) { return s.id === t.studentId; });
      var inst = st && t.installmentId ? (st.installments || []).find(function (i) { return i.id === t.installmentId; }) : null;
      var refAmount = inst ? Number(inst.amount || 0) : (st ? Number(st.tuition || 0) : 0);
      var diff = st ? t.deposit - refAmount : 0;
      var diffNote = st && diff !== 0
        ? " " + pill((diff > 0 ? "+" : "") + won(diff) + " 차이", "warn")
        : "";
      var roundLabel = inst ? " (" + inst.round + "회차 · " + monthLabelShort(inst.month) + ")" : "";
      var cardPaymentCb = '<label style="margin-left:8px;font-weight:400;display:inline-flex;align-items:center;gap:4px;white-space:nowrap"><input type="checkbox" data-cardpayment-toggle="' + t.id + '"' + (t.cardPayment ? " checked" : "") + '> 카드결제(영수증 불필요)</label>';
      var cashReceiptCb = t.cardPayment ? "" : ('<label style="margin-left:8px;font-weight:400;display:inline-flex;align-items:center;gap:4px;white-space:nowrap"><input type="checkbox" data-cashreceipt-toggle="' + t.id + '"' + (t.cashReceiptIssued ? " checked" : "") + '> 현금영수증 발행</label>');
      return pill("수강료 확정", "good") + (st ? ' <span class="meta">→ ' + esc(dupNamesStudents[st.id] || st.name) + roundLabel + "</span>" : "") + diffNote + cardPaymentCb + cashReceiptCb +
        ' <button class="btn btn-ghost btn-sm" data-unlink-tx="' + t.id + '">해제</button>';
    }
    if (t.category === "consulting") {
      return pill("컨설팅입금", "accent") + ' <button class="btn btn-ghost btn-sm" data-undo-tx="' + t.id + '">되돌리기</button>';
    }
    if (t.category === "capital") {
      return pill("출자금", "brand") + ' <button class="btn btn-ghost btn-sm" data-undo-tx="' + t.id + '">되돌리기</button>';
    }
    if (t.category === "general") {
      return pill("일반입금", "neutral") + ' <button class="btn btn-ghost btn-sm" data-undo-tx="' + t.id + '">되돌리기</button>';
    }
    if (t.category === "reimburse") {
      return pill("정산입금(대납 회수)", "neutral") + ' <span class="meta">매출 제외</span> <button class="btn btn-ghost btn-sm" data-undo-tx="' + t.id + '">되돌리기</button>';
    }
    var suggested = suggestStudentFor(t);
    var candidates = unpaidCandidatesFor(t);
    var options = '<option value="">수강생 선택</option>' + candidates.map(function (c) {
      var val = c.student.id + "::" + (c.installment ? c.installment.id : (c.virtualRound ? "NEW" : ""));
      var roundLabel = c.installment ? " · " + c.installment.round + "회차(" + monthLabelShort(c.installment.month) + ")"
        : (c.virtualRound ? " · " + c.virtualRound + "회차(신규)" : "");
      var isSel = suggested && suggested.student.id === c.student.id
        && (suggested.installment ? suggested.installment.id : (suggested.virtualRound ? "NEW" : "")) === (c.installment ? c.installment.id : (c.virtualRound ? "NEW" : ""));
      return '<option value="' + val + '"' + (isSel ? " selected" : "") + ">" + esc(dupNamesStudents[c.student.id] || c.student.name) + " · " + esc(c.student.level) + roundLabel + " · " + won(c.amount) + "</option>";
    }).join("");
    var multiPending = bankMultiSelectPending[t.id] || {};
    var multiOptions = candidates.slice().sort(function (a, b) {
      return (a.student.name || "").localeCompare((b.student.name || ""), "ko");
    }).map(function (c) {
      var val = c.student.id + "::" + (c.installment ? c.installment.id : (c.virtualRound ? "NEW" : ""));
      var displayName = dupNamesStudents[c.student.id] || c.student.name;
      var suffix = c.alreadyPaid ? ' <span class="meta">(입금완료)</span>' : "";
      var isChecked = !!multiPending[val];
      return '<label class="multi-select-item" data-name="' + esc(displayName) + '" style="display:flex;align-items:center;gap:6px;padding:3px 0;font-weight:400"><input type="checkbox" data-multi-select="' + t.id + '" value="' + val + '"' + (isChecked ? " checked" : "") + "> " + esc(displayName) + suffix + "</label>";
    }).join("");
    var singleListHtml = candidates.slice().sort(function (a, b) {
      return (a.student.name || "").localeCompare((b.student.name || ""), "ko");
    }).map(function (c) {
      var val = c.student.id + "::" + (c.installment ? c.installment.id : (c.virtualRound ? "NEW" : ""));
      var displayName = dupNamesStudents[c.student.id] || c.student.name;
      var isSel = suggested && suggested.student.id === c.student.id
        && (suggested.installment ? suggested.installment.id : (suggested.virtualRound ? "NEW" : "")) === (c.installment ? c.installment.id : (c.virtualRound ? "NEW" : ""));
      var suffix = c.alreadyPaid ? ' <span class="meta">(입금완료)</span>' : "";
      return '<div class="single-select-item' + (isSel ? " is-selected" : "") + '" data-name="' + esc(displayName) + '" data-single-pick="' + t.id + '" data-value="' + val + '" style="padding:5px 8px;cursor:pointer;border-radius:4px">' + esc(displayName) + suffix + "</div>";
    }).join("");
    var suggestedName = suggested ? esc(dupNamesStudents[suggested.student.id] || suggested.student.name) : "";
    return (suggested ? pill("추천: " + (dupNamesStudents[suggested.student.id] || suggested.student.name), "warn") : pill("미확정", "neutral")) + "<br>" +
      ' <div style="position:relative;display:inline-block;max-width:220px;vertical-align:top">' +
      '<input type="text" class="inline-select" data-single-search="' + t.id + '" placeholder="🔍 수강생 이름 검색" value="' + suggestedName + '" autocomplete="off" style="width:100%">' +
      '<select class="inline-select" data-link-select="' + t.id + '" style="display:none">' + options + "</select>" +
      (candidates.length ? '<div class="single-select-list" data-single-list="' + t.id + '" style="display:none;position:absolute;z-index:5;top:100%;left:0;margin-top:2px;background:var(--surface);border:1px solid var(--border);border-radius:8px;max-height:180px;overflow-y:auto;width:100%;min-width:190px;box-shadow:0 4px 14px rgba(0,0,0,.15)">' + singleListHtml + "</div>" : "") +
      "</div>" +
      ' <button class="btn btn-primary btn-sm" data-confirm-select="' + t.id + '">수강료 확정</button>' +
      ' <button class="btn btn-ghost btn-sm" data-mark-consulting="' + t.id + '">컨설팅입금</button>' +
      ' <button class="btn btn-ghost btn-sm" data-mark-capital="' + t.id + '">출자금</button>' +
      ' <button class="btn btn-ghost btn-sm" data-mark-general="' + t.id + '">일반입금</button>' +
      ' <button class="btn btn-ghost btn-sm" data-mark-reimburse="' + t.id + '" title="회사카드 대납을 수강생이 돌려준 돈 (매출 제외)">정산입금</button><br>' +
      ' <input type="text" class="inline-select" data-new-student-name="' + t.id + '" placeholder="목록에 없으면 새 수강생 이름" style="max-width:150px;margin-top:6px">' +
      ' <span style="display:inline-flex;gap:8px;flex-wrap:wrap;margin-left:4px">' + STUDENT_DB_COURSE_KEYS.map(function (k) {
        return '<label style="display:inline-flex;align-items:center;gap:3px;font-size:11.5px;font-weight:400;color:var(--ink-soft)"><input type="checkbox" data-new-student-course="' + k + '" data-tx-id="' + t.id + '"> ' + STUDENT_DB_COURSE_LABELS[k] + "</label>";
      }).join("") + "</span>" +
      ' <button class="btn btn-ghost btn-sm" data-add-student-confirm="' + t.id + '">+ 추가 후 연결</button>' +
      '<details data-multi-details="' + t.id + '"' + (bankMultiDetailsOpen[t.id] ? " open" : "") + ' style="margin-top:6px"><summary style="cursor:pointer;font-size:12px;color:var(--ink-soft)">카드사 정산처럼 여러 명이 한 번에 입금된 경우 ▾</summary>' +
      '<div style="padding:6px 0">' +
      (candidates.length ? '<input type="text" class="inline-select" data-multi-search="' + t.id + '" placeholder="🔍 이름 검색" style="margin-bottom:6px;width:100%;max-width:220px">' : "") +
      '<div class="multi-select-list" data-multi-list="' + t.id + '" style="display:flex;flex-direction:column;max-height:180px;overflow-y:auto">' + (multiOptions || '<span class="meta">선택 가능한 수강생이 없습니다.</span>') + "</div>" +
      '<div style="display:flex;gap:6px;align-items:center;margin-top:8px">' +
      '<input type="text" class="inline-select" data-multi-new-student-name="' + t.id + '" placeholder="목록에 없으면 새 수강생 이름" style="max-width:150px">' +
      '<span style="display:inline-flex;gap:8px;flex-wrap:wrap">' + STUDENT_DB_COURSE_KEYS.map(function (k) {
        return '<label style="display:inline-flex;align-items:center;gap:3px;font-size:11.5px;font-weight:400;color:var(--ink-soft)"><input type="checkbox" data-multi-new-student-course="' + k + '" data-tx-id="' + t.id + '"> ' + STUDENT_DB_COURSE_LABELS[k] + "</label>";
      }).join("") + "</span>" +
      '<button type="button" class="btn btn-ghost btn-sm" data-multi-add-student="' + t.id + '">+ 추가</button>' +
      "</div>" +
      "</div>" +
      ' <button type="button" class="btn btn-primary btn-sm" data-confirm-multi="' + t.id + '">선택한 인원 모두 확정</button>' +
      "</details>";
  }

  /* ---------------- Tasks ---------------- */
  function renderTasks() {
    var today = todayStr();
    var d = parseYMD(today);

    var filtered = state.tasks.filter(function (t) {
      if (taskFilterCategory !== "all" && t.category !== taskFilterCategory) return false;
      if (taskFilterDone === "open" && t.done) return false;
      if (taskFilterDone === "done" && !t.done) return false;
      return true;
    });
    var overdue = filtered.filter(function (t) { return !t.done && t.date < today; });
    var todayList = filtered.filter(function (t) { return t.date === today; });
    var upcoming = filtered.filter(function (t) { return t.date > today; });
    var pastDone = filtered.filter(function (t) { return t.date < today && t.done; });

    var html = "";
    html += '<div class="page-head"><div><h1>업무 체크리스트</h1><div class="sub">에듀 교육부터 대표님 개인업무, 마케팅, 행정까지 전 업무 통합 관리</div></div></div>';

    html += '<div class="card" style="margin-bottom:22px">';
    html += "<h3>정규 수업 일정</h3>";
    html += '<div class="schedule-strip">';
    [1, 2, 4].forEach(function (wd) {
      var meta = WEEKDAY_SCHEDULE[wd];
      var isToday = d.getDay() === wd;
      html += '<div class="schedule-day' + (isToday ? " is-today" : "") + '"><div class="d">' + meta.label + (isToday ? " · 오늘" : "") + '</div><div class="c">' + esc(meta.cls) + "</div></div>";
    });
    html += "</div></div>";

    html += '<form class="add-form" id="taskForm">';
    html += field("날짜", '<input type="date" name="date" value="' + today + '" required>');
    html += field("구분", selectHtml("category", CATEGORY_ORDER, "edu", null, null, true));
    html += field("업무 내용", '<input type="text" name="title" placeholder="예: 초급반 강의자료 출력" required>', "grow");
    html += '<button type="submit" class="btn btn-primary">+ 업무 추가</button>';
    html += "</form>";

    html += '<div class="filter-bar">';
    html += '<button class="filter-chip" data-cat-filter="all" aria-pressed="' + (taskFilterCategory === "all") + '">전체 구분</button>';
    CATEGORY_ORDER.forEach(function (c) {
      html += '<button class="filter-chip" data-cat-filter="' + c + '" aria-pressed="' + (taskFilterCategory === c) + '">' + esc(CATEGORY_META[c].label) + "</button>";
    });
    html += "</div>";
    html += '<div class="filter-bar">';
    [["all", "전체"], ["open", "미완료"], ["done", "완료"]].forEach(function (p) {
      html += '<button class="filter-chip" data-done-filter="' + p[0] + '" aria-pressed="' + (taskFilterDone === p[0]) + '">' + p[1] + "</button>";
    });
    html += "</div>";

    html += '<div class="task-group-title">지연 (' + overdue.length + "건)</div>";
    html += taskListHtml(overdue, true);
    html += '<div class="task-group-title">오늘 · ' + formatShortDate(today) + " (" + todayList.length + "건)</div>";
    html += taskListHtml(todayList, false);
    html += '<div class="task-group-title">예정 (' + upcoming.length + "건)</div>";
    html += taskListHtml(upcoming, false);
    if (pastDone.length) {
      html += '<div class="task-group-title">완료된 지난 업무 (' + pastDone.length + "건)</div>";
      html += taskListHtml(pastDone, false);
    }

    document.getElementById("main").innerHTML = html;

    document.getElementById("taskForm").addEventListener("submit", function (e) {
      e.preventDefault();
      var fd = new FormData(e.target);
      var title = (fd.get("title") || "").toString().trim();
      if (!title) return;
      state.tasks.push({ id: uid(), date: fd.get("date"), category: fd.get("category"), title: title, done: false, createdAt: new Date().toISOString() });
      saveState(); toast("업무가 추가되었습니다."); render();
    });

    Array.prototype.forEach.call(document.querySelectorAll("[data-cat-filter]"), function (btn) {
      btn.addEventListener("click", function () { taskFilterCategory = btn.getAttribute("data-cat-filter"); render(); });
    });
    Array.prototype.forEach.call(document.querySelectorAll("[data-done-filter]"), function (btn) {
      btn.addEventListener("click", function () { taskFilterDone = btn.getAttribute("data-done-filter"); render(); });
    });
    Array.prototype.forEach.call(document.querySelectorAll("[data-task-toggle]"), function (cb) {
      cb.addEventListener("change", function () {
        var t = state.tasks.find(function (x) { return x.id === cb.getAttribute("data-task-toggle"); });
        if (t) { t.done = cb.checked; saveState(); render(); }
      });
    });
    Array.prototype.forEach.call(document.querySelectorAll("[data-task-del]"), function (btn) {
      btn.addEventListener("click", function () {
        state.tasks = state.tasks.filter(function (x) { return x.id !== btn.getAttribute("data-task-del"); });
        saveState(); toast("삭제되었습니다."); render();
      });
    });
  }

  function taskListHtml(list, isOverdue) {
    if (list.length === 0) return '<div class="empty-state">해당하는 업무가 없습니다.</div>';
    return list.slice().sort(function (a, b) { return a.date.localeCompare(b.date); }).map(function (t) {
      return '<div class="task-row' + (t.done ? " done" : "") + '">' +
        '<input type="checkbox" data-task-toggle="' + t.id + '" ' + (t.done ? "checked" : "") + ">" +
        '<span class="task-date">' + formatShortDate(t.date) + "</span>" +
        tag(t.category) +
        '<span class="task-title">' + esc(t.title) + "</span>" +
        (isOverdue ? pill("지연", "danger") : "") +
        '<button class="icon-btn" data-task-del="' + t.id + '" aria-label="삭제">✕</button>' +
        "</div>";
    }).join("");
  }

  /* ---------------- Backup ---------------- */
  function renderBackup() {
    var html = "";
    html += '<div class="page-head"><div><h1>데이터 백업 · 공유</h1><div class="sub">이 대시보드의 데이터 보관 방식과 대표님과의 공유 방법</div></div></div>';

    html += '<div class="backup-note">📌 이 대시보드는 데이터를 변경하면 <b>이 기기에 즉시 저장</b>하고, 잠시 후(약 10초) <b>Google Drive에도 자동으로 백업</b>합니다. 다른 컴퓨터에서 이 대시보드를 열면 시작할 때 자동으로 최신 데이터를 가져오고, 이 창을 열어둔 동안에도 몇 분마다 다른 기기의 변경사항이 있는지 확인합니다. (Google Drive 커넥터 연결이 필요합니다)</div>';

    html += '<div class="card">';
    html += '<h3>☁ 클라우드 자동 동기화</h3>';
    html += '<div class="mapping-hint">평소엔 그냥 쓰시면 자동으로 백업/동기화됩니다. 지금 바로 반영하고 싶을 때만 아래 버튼을 눌러주세요.</div>';
    html += '<div class="backup-actions">';
    html += '<button class="btn btn-primary" id="driveSaveBtn">☁ 지금 백업</button>';
    html += '<button class="btn btn-ghost" id="driveLoadBtn">☁ 최신 데이터 지금 불러오기</button>';
    html += "</div>";
    html += '<div class="list-row" style="margin-top:10px"><span class="txt">동기화 상태</span><span class="meta">' + esc(cloudSyncStatusLabel()) + "</span></div>";
    // "동기화 중…" 만 보이면 왜 안 되는지 알 길이 없다. 마지막 저장 오류를 그대로 보여 준다.
    if (state.meta.lastCloudSaveError) {
      html += '<div class="list-row"><span class="txt">마지막 저장 오류</span><span class="meta tone-warn">' + esc(state.meta.lastCloudSaveError) + "</span></div>";
    }
    html += '<div class="list-row"><span class="txt">마지막 클라우드 동기화</span><span class="meta">' + (state.meta.lastCloudSync ? new Date(state.meta.lastCloudSync).toLocaleString("ko-KR") : "-") + "</span></div>";
    if (state.meta.lastCloudSaveBytes) {
      html += '<div class="list-row"><span class="txt">마지막 저장 크기</span><span class="meta">' + Math.round(state.meta.lastCloudSaveBytes / 1024) + "KB" + (state.meta.lastCloudSaveGzip ? " (gzip 압축 · 원본 " + Math.round(JSON.stringify(state).length / 1024) + "KB)" : " (평문 JSON)") + "</span></div>";
    }
    html += "</div>";

    html += '<div class="card section-gap">';
    html += "<h3>내보내기 / 가져오기 (파일로 직접 전달)</h3>";
    html += '<div class="backup-actions">';
    html += '<button class="btn btn-primary" id="exportBtn">⬇ 데이터 내보내기 (JSON)</button>';
    html += '<label class="file-label btn btn-ghost" for="importFile">⬆ 데이터 가져오기</label><input type="file" id="importFile" accept="application/json">';
    html += '<button class="btn btn-danger-ghost" id="resetBtn">전체 데이터 초기화</button>';
    html += "</div></div>";

    html += '<div class="card section-gap"><h3>현재 저장된 데이터 요약</h3>';
    html += '<div class="list-row"><span class="txt">수강생</span><span class="meta">' + state.students.length + "건</span></div>";
    html += '<div class="list-row"><span class="txt">경매 · 컨설팅</span><span class="meta">' + state.auctions.length + "건</span></div>";
    html += '<div class="list-row"><span class="txt">데일리 경매분석</span><span class="meta">' + state.marketAuctions.length + "건</span></div>";
    html += '<div class="list-row"><span class="txt">수강생 DB</span><span class="meta">' + state.studentDb.length + "건</span></div>";
    html += '<div class="list-row"><span class="txt">대출상담</span><span class="meta">' + state.loans.length + "건</span></div>";
    html += '<div class="list-row"><span class="txt">은행 거래내역</span><span class="meta">' + state.transactions.length + "건</span></div>";
    html += '<div class="list-row"><span class="txt">블로그 업무</span><span class="meta">' + state.blogPosts.length + "건</span></div>";
    html += '<div class="list-row"><span class="txt">시장조사</span><span class="meta">' + state.marketResearch.length + "건</span></div>";
    html += '<div class="list-row"><span class="txt">콘텐츠 아이디어</span><span class="meta">' + state.contentIdeas.length + "건</span></div>";
    html += '<div class="list-row"><span class="txt">캐러셀 초안</span><span class="meta">' + state.carouselDrafts.length + "건</span></div>";
    html += '<div class="list-row"><span class="txt">브랜드전략 리포트</span><span class="meta">' + state.brandStrategyReports.length + "건</span></div>";
    html += '<div class="list-row"><span class="txt">일정</span><span class="meta">' + state.schedule.length + "건</span></div>";
    html += '<div class="list-row"><span class="txt">업무보고서</span><span class="meta">' + state.workReports.length + "건</span></div>";
    html += '<div class="list-row"><span class="txt">대법원판례</span><span class="meta">' + state.resources.length + "건</span></div>";
    html += '<div class="list-row"><span class="txt">업무 체크리스트</span><span class="meta">' + state.tasks.length + "건</span></div>";
    html += '<div class="list-row"><span class="txt">마지막 저장</span><span class="meta">' + (state.meta.lastUpdated ? new Date(state.meta.lastUpdated).toLocaleString("ko-KR") : "-") + "</span></div>";
    html += "</div>";

    // 자동 수집이 언제 돌았고 무엇이 실패했는지. 실패는 예전에 조용히 사라져서 확인할 방법이 없었다.
    var lastCheck = state.meta.lastSyncCheckAt;
    var lastErr = state.meta.lastSyncError;
    var failEvents = (state.meta.syncEvents || []).filter(function (e) { return e.message.indexOf("⚠") === 0; }).slice(0, 5);
    html += '<div class="card section-gap"><h3>☁ 자동 수집 상태' +
      (lastErr ? '<span class="count">최근 실패 있음</span>' : "") + "</h3>";
    html += '<div class="list-row"><span class="txt">마지막 점검 시각</span><span class="meta">' +
      (lastCheck ? new Date(lastCheck).toLocaleString("ko-KR") : "아직 점검한 적 없음") + "</span>" +
      (lastCheck ? pill("정상", "good") : pill("대기", "neutral")) + "</div>";
    html += '<div class="list-row"><span class="txt">처리한 원격 패치 파일</span><span class="meta">' +
      Object.keys(state.meta.processedPatchChunkIds || {}).length + "개</span></div>";
    if (lastErr) {
      html += '<div class="list-row"><span class="dot" style="background:var(--danger)"></span><span class="txt">최근 실패: ' +
        esc(lastErr.job || "") + "</span><span class=\"meta\">" + new Date(lastErr.at).toLocaleString("ko-KR") + "</span></div>";
      html += '<div class="hint" style="margin-top:2px">' + esc(lastErr.message || "") + "</div>";
    }
    if (failEvents.length) {
      html += '<div class="hint" style="margin-top:10px;font-weight:700">최근 실패 기록 ' + failEvents.length + "건</div>";
      failEvents.forEach(function (e) {
        html += '<div class="list-row"><span class="txt">' + esc(e.message) + '</span><span class="meta">' +
          new Date(e.at).toLocaleString("ko-KR") + "</span></div>";
      });
    } else {
      html += '<div class="hint" style="margin-top:10px">기록된 수집 실패가 없습니다.</div>';
    }
    html += '<div class="hint" style="margin-top:10px">대시보드가 <b>열려 있는 동안에만</b> 수집합니다 — 열 때 1회, 이후 3분마다, 다른 탭 보다가 돌아올 때. 닫혀 있으면 Drive에 쌓였다가 다음에 열 때 한꺼번에 반영됩니다.</div>';
    html += "</div>";

    document.getElementById("main").innerHTML = html;

    document.getElementById("driveSaveBtn").addEventListener("click", function () { driveSaveSnapshot(render, false); });
    document.getElementById("driveLoadBtn").addEventListener("click", function () { driveLoadLatestSnapshot(); });

    document.getElementById("exportBtn").addEventListener("click", async function () {
      if (!window.claude || !window.claude.downloads) { toast("이 환경에서는 다운로드를 지원하지 않습니다."); return; }
      var filename = "안효준대리_업무대시보드_" + todayStr() + ".json";
      try {
        await window.claude.downloads.save({ filename: filename, data: JSON.stringify(state, null, 2) });
        toast("내보내기가 완료되었습니다.");
      } catch (err) {
        if (err && err.code === "declined") return;
        toast("내보내기에 실패했습니다.");
      }
    });

    document.getElementById("importFile").addEventListener("change", function (e) {
      var file = e.target.files[0];
      if (!file) return;
      var reader = new FileReader();
      reader.onload = function () {
        var incoming;
        try {
          incoming = JSON.parse(reader.result);
        } catch (err) { toast("파일을 읽을 수 없습니다. JSON 형식을 확인해주세요."); return; }
        customConfirm("가져온 데이터로 현재 데이터를 덮어씁니다. 계속할까요?", function () {
          state = {
            students: incoming.students || [], auctions: incoming.auctions || [],
            loans: incoming.loans || [], tasks: incoming.tasks || [], transactions: incoming.transactions || [],
            blogPosts: incoming.blogPosts || [], blogPostsTrash: incoming.blogPostsTrash || [], blogAutomationLog: incoming.blogAutomationLog || [], marketAuctions: incoming.marketAuctions || [], studentDb: incoming.studentDb || [], loanConsultants: incoming.loanConsultants || [],
            marketResearch: incoming.marketResearch || [], contentIdeas: incoming.contentIdeas || [], schedule: incoming.schedule || [], workReports: incoming.workReports || [], resources: incoming.resources || [], carouselDrafts: incoming.carouselDrafts || [], brandStrategyReports: incoming.brandStrategyReports || [], routineRuns: incoming.routineRuns || [], ceoOrders: incoming.ceoOrders || [],
            meta: incoming.meta || {}
          };
          saveState(); toast("데이터를 가져왔습니다."); render();
        });
      };
      reader.readAsText(file);
      e.target.value = "";
    });

    document.getElementById("resetBtn").addEventListener("click", function () {
      customConfirm("모든 데이터를 삭제합니다. 이 작업은 되돌릴 수 없습니다. 계속할까요?", function () {
        state = { students: [], auctions: [], loans: [], tasks: [], transactions: [], blogPosts: [], blogPostsTrash: [], blogAutomationLog: [], marketAuctions: [], studentDb: [], loanConsultants: [], marketResearch: [], contentIdeas: [], schedule: [], workReports: [], resources: [], carouselDrafts: [], brandStrategyReports: [], meta: { lastUpdated: null } };
        saveState(); toast("데이터가 초기화되었습니다."); render();
      });
    });
  }

  /* ---------------- Shared helpers ---------------- */
  function field(labelText, inputHtml, extraClass) {
    return '<div class="field' + (extraClass ? " " + extraClass : "") + '"><label>' + esc(labelText) + "</label>" + inputHtml + "</div>";
  }
  function selectHtml(name, options, selected, rowId, entity, useCategoryLabels) {
    // 저장된 값이 목록에 없으면 <select> 는 말없이 첫 항목을 고른다. 그대로 저장하면
    // 원래 값이 사라진다. 모르는 값은 목록 앞에 끼워 넣어 최소한 안 잃게 한다.
    if (selected && !useCategoryLabels && options.indexOf(selected) === -1) {
      options = [selected].concat(options);
    }
    var opts = options.map(function (o) {
      var label = useCategoryLabels ? CATEGORY_META[o].label : o;
      return '<option value="' + esc(o) + '" ' + (o === selected ? "selected" : "") + ">" + esc(label) + "</option>";
    }).join("");
    if (rowId && entity) {
      return '<select class="inline-select" data-inline-select="' + name + '" data-id="' + rowId + '" data-entity="' + entity + '">' + opts + "</select>";
    }
    return '<select name="' + name + '">' + opts + "</select>";
  }

  function bindTableCommon(entity) {
    var listKey = entity === "student" ? "students" : entity === "auction" ? "auctions" : entity === "loan" ? "loans" : entity === "market" ? "marketAuctions" : entity === "studentDb" ? "studentDb" : entity === "loanConsultant" ? "loanConsultants" : entity === "marketResearch" ? "marketResearch" : entity === "contentIdea" ? "contentIdeas" : entity === "resource" ? "resources" : entity === "schedule" ? "schedule" : entity === "carouselDraft" ? "carouselDrafts" : entity === "brandStrategy" ? "brandStrategyReports" : "blogPosts";
    Array.prototype.forEach.call(document.querySelectorAll('[data-inline-select][data-entity="' + entity + '"]'), function (sel) {
      sel.addEventListener("change", function () {
        var item = state[listKey].find(function (x) { return x.id === sel.getAttribute("data-id"); });
        if (!item) return;
        var field = sel.getAttribute("data-inline-select");
        var prevStatus = item.status;
        item[field] = sel.value;
        if (entity !== "student" && entity !== "auction") item.updatedAt = new Date().toISOString();
        if (entity === "student" && field === "level") syncStudentDbConsultingFlag(item);
        if (entity === "market" && field === "status" && sel.value === "유찰" && prevStatus !== "유찰") {
          var failInfo = marketFailBidPreview(item);
          if (failInfo.status === "ok") {
            item.minSalePrice = failInfo.next;
            item.failCount = (item.failCount || 0) + 1;
            toast(failInfo.matchedName + " 기준 " + failInfo.rate + "% 저감 → 최저가 " + won(failInfo.next) + "로 자동 갱신했습니다.");
          } else if (failInfo.status === "ambiguous") {
            toast(failInfo.matchedName + "은 저감율이 사건마다 달라 최저가는 자동 갱신되지 않았습니다. 직접 확인해주세요.");
          } else {
            toast("이 법원의 유찰저감율 정보가 없어 최저가는 자동 갱신되지 않았습니다.");
          }
        }
        saveState(); render();
      });
    });
    Array.prototype.forEach.call(document.querySelectorAll('[data-inline-date][data-entity="' + entity + '"]'), function (inp) {
      inp.addEventListener("change", function () {
        if (!inp.value) return;
        var item = state[listKey].find(function (x) { return x.id === inp.getAttribute("data-id"); });
        if (!item) return;
        item[inp.getAttribute("data-inline-date")] = inp.value;
        if (entity !== "student" && entity !== "auction") item.updatedAt = new Date().toISOString();
        saveState(); render();
      });
    });
    Array.prototype.forEach.call(document.querySelectorAll('[data-inline-number][data-entity="' + entity + '"]'), function (inp) {
      inp.addEventListener("change", function () {
        var item = state[listKey].find(function (x) { return x.id === inp.getAttribute("data-id"); });
        if (!item) return;
        item[inp.getAttribute("data-inline-number")] = Number(inp.value) || 0;
        if (entity !== "student" && entity !== "auction") item.updatedAt = new Date().toISOString();
        saveState(); render();
      });
    });
    Array.prototype.forEach.call(document.querySelectorAll('[data-inline-text][data-entity="' + entity + '"]'), function (inp) {
      inp.addEventListener("change", function () {
        var item = state[listKey].find(function (x) { return x.id === inp.getAttribute("data-id"); });
        if (!item) return;
        item[inp.getAttribute("data-inline-text")] = inp.value;
        if (entity !== "student" && entity !== "auction") item.updatedAt = new Date().toISOString();
        saveState(); render();
      });
    });
    Array.prototype.forEach.call(document.querySelectorAll('[data-toggle]'), function (cb) {
      cb.addEventListener("change", function () {
        var item = state[listKey].find(function (x) { return x.id === cb.getAttribute("data-id"); });
        if (!item) return;
        var field = cb.getAttribute("data-toggle");
        item[field] = cb.checked;
        if (entity === "student" && field === "paid") {
          item.paidDate = cb.checked ? (item.paidDate || todayStr()) : null;
        }
        saveState(); render();
      });
    });
    Array.prototype.forEach.call(document.querySelectorAll('[data-del="' + entity + '"]'), function (btn) {
      btn.addEventListener("click", function () {
        var delId = btn.getAttribute("data-id");
        var confirmMsg = entity === "blog" ? "휴지통으로 이동합니다. 계속할까요?" : "삭제하시겠습니까?";
        if (entity === "student") {
          var target = state.students.find(function (x) { return x.id === delId; });
          if (target && target.studentDbId && state.studentDb.some(function (d) { return d.id === target.studentDbId; })) {
            confirmMsg = "삭제하시겠습니까? 연동된 수강생 DB 항목도 함께 삭제됩니다.";
          }
        }
        if (entity === "studentDb") {
          var targetDb = state.studentDb.find(function (x) { return x.id === delId; });
          if (targetDb && targetDb.linkedStudentId && state.students.some(function (s) { return s.id === targetDb.linkedStudentId; })) {
            confirmMsg = "삭제하시겠습니까? 연동된 수강생 · 매출 실적 데이터도 함께 삭제됩니다.";
          }
        }
        customConfirm(confirmMsg, function () {
          if (entity === "market") {
            var delMarket = state.marketAuctions.find(function (x) { return x.id === delId; });
            if (delMarket) rememberMarketDeleted(delMarket.caseNumber);   // 현황판이 다시 보내도 되살아나지 않게
          }
          if (entity === "student") {
            var deleted = state.students.find(function (x) { return x.id === delId; });
            if (deleted && deleted.studentDbId) {
              state.studentDb = state.studentDb.filter(function (d) { return d.id !== deleted.studentDbId; });
            }
          }
          if (entity === "studentDb") {
            var deletedDb = state.studentDb.find(function (x) { return x.id === delId; });
            if (deletedDb && deletedDb.linkedStudentId) {
              state.students = state.students.filter(function (x) { return x.id !== deletedDb.linkedStudentId; });
            }
          }
          if (entity === "blog") {
            var delIdx = state.blogPosts.findIndex(function (x) { return x.id === delId; });
            if (delIdx !== -1) {
              var trashed = state.blogPosts.splice(delIdx, 1)[0];
              trashed.deletedAt = new Date().toISOString();
              state.blogPostsTrash.unshift(trashed);
            }
            saveState(); toast("휴지통으로 이동했습니다."); render();
            return;
          }
          state[listKey] = state[listKey].filter(function (x) { return x.id !== delId; });
          saveState(); toast("삭제되었습니다."); render();
        });
      });
    });
  }

  /* ---------------- Router ---------------- */

  // ── 전체 업무 목록 (세로 메뉴) ────────────────────────────────
  // 상단 메뉴를 탭 5개로 줄이면서 화면 11개로 가는 길이 통합 업무본부 카드 하나만 남았다.
  // 그랬더니 한 화면에서 다른 화면으로 바로 못 넘어갔다 — 원래 있던 목록을 여기로 되살린다.
  // 통합 업무본부 탭과, 홈이 아닌 모든 화면에 붙는다(홈의 다른 탭에서는 안 붙는다 — 사무실을 가리므로).
  var DRIVE_BACKUP_FOLDER_URL = "https://drive.google.com/drive/folders/1ZkIT6DPRGBg8DYu9ezNTEjo6ekUJMvZ4";
  // 메뉴는 화면에 붙이지 않고 오른쪽 서랍에 넣는다. 홈은 "오늘 볼 것"만 남기고,
  // 12개 화면으로 가는 길은 ☰ 하나로 모은다(예전엔 상단 탭·왼쪽 목록·입구 카드 셋이 겹쳤다).
  function workRailVisible() {
    // 통합 업무본부에는 같은 12곳을 가리키는 입구 카드가 이미 있다. 둘 다 띄우면
    // 화면 하나에 같은 메뉴가 두 벌 있는 셈이라 목록은 홈 밖에서만 띄운다.
    return currentView !== "home";
  }
  // 목록은 글자만 열두 줄이면 어디가 어딘지 안 잡힌다. 앞에 그림 하나, 뒤에 지금 숫자,
  // 가운데는 분류로 끊어 준다 — 셋 다 '무엇을 누를지' 고르는 데 쓰인다.
  var RAIL_ICON = {
    studentDb: "👥", students: "💳", bank: "🏦", auctions: "⚖️", marketAuction: "📈",
    loanConsultants: "🤝", caselaw: "📜", auctionMap: "🗺", housing: "🏠", blog: "📝", team: "🤖",
    workReports: "📝", backup: "☁️"
  };
  function railBadge(id) {
    if (id === "blog") {
      var n = state.blogPosts.filter(function (p) { return p.status === "발행대기"; }).length;
      return n ? { n: n, tone: n >= 20 ? "warn" : "" } : null;
    }
    if (id === "team") {
      var lateN = ROUTINE_JOBS.map(function (j) { return routineStatus(j, aiWorkLogEvents()); })
        .filter(function (st) { return st.kind === "late" || st.kind === "fail"; }).length;
      return lateN ? { n: lateN, tone: "warn" } : null;
    }
    if (id === "bank") {
      var d = state.transactions.filter(function (t) { return t.deposit > 0 && !t.category && !t.studentId; }).length;
      return d ? { n: d, tone: "warn" } : null;
    }
    if (id === "marketAuction") {
      var o = marketResultOverdueList().length;
      return o ? { n: o, tone: "warn" } : null;
    }
    return null;
  }
  function workRailHtml() {
    var html = '<div class="wb-rail-head">전체 업무</div><div class="wb-rail-list">';
    var lastSec = null;
    VIEWS.forEach(function (v) {
      if (v.id === "home") return;
      if (v.section && v.section !== lastSec) {
        lastSec = v.section;
        html += '<div class="wb-sec">' + esc(v.section) + "</div>";
      }
      var ic = '<i class="wb-ic">' + (RAIL_ICON[v.id] || "•") + "</i>";
      var tx = '<span class="wb-tx">' + esc(v.short || v.label) + "</span>";
      if (v.external) {
        html += '<a class="wb-item wb-ext" href="' + esc(v.external) + '" target="_blank" rel="noopener">' +
          ic + tx + '<em class="wb-out">↗</em></a>';
        return;
      }
      var b = railBadge(v.id);
      html += '<button type="button" class="wb-item' + (currentView === v.id ? " on" : "") +
        '" data-rail-view="' + v.id + '">' + ic + tx +
        (b ? '<em class="wb-n' + (b.tone ? " " + b.tone : "") + '">' + b.n + "</em>" : "") + "</button>";
    });
    html += "</div>";
    html += '<a class="wb-drive" href="' + DRIVE_BACKUP_FOLDER_URL + '" target="_blank" rel="noopener">📁 Drive 보관함 열기</a>';
    return html;
  }

  var drawerOpen = false;
  function renderWorkDrawer() {
    var wrap = document.getElementById("wbDrawer");
    var panel = document.getElementById("wbDrawerPanel");
    if (!wrap || !panel) return;
    wrap.hidden = !drawerOpen;
    document.body.style.overflow = drawerOpen ? "hidden" : "";
    if (!drawerOpen) return;
    panel.innerHTML = '<div class="wb-drawer-head"><b>전체 업무</b>' +
      '<button type="button" class="wb-drawer-x" data-drawer-close aria-label="닫기">✕</button></div>' +
      workRailHtml();
    Array.prototype.forEach.call(panel.querySelectorAll("[data-rail-view]"), function (b) {
      b.addEventListener("click", function () {
        currentView = b.getAttribute("data-rail-view");
        pendingImport = null; teamMemberView = null; drawerOpen = false;
        render(); window.scrollTo(0, 0);
      });
    });
    Array.prototype.forEach.call(panel.querySelectorAll("[data-rail-home]"), function (b) {
      b.addEventListener("click", function () {
        state.meta[homeModeKey()] = b.getAttribute("data-rail-home");
        persistLocal();
        currentView = "home"; pendingImport = null; teamMemberView = null; drawerOpen = false;
        render(); window.scrollTo(0, 0);
      });
    });
    Array.prototype.forEach.call(wrap.querySelectorAll("[data-drawer-close]"), function (b) {
      b.addEventListener("click", function () { drawerOpen = false; renderWorkDrawer(); });
    });
  }

  function render() {
    officeMapOnPage = false;
    renderNav();
    if (currentView === "home") renderHome();
    else if (currentView === "students") renderStudents();
    else if (currentView === "bank") renderBank();
    else if (currentView === "auctions") renderAuctionsLoans();
    else if (currentView === "marketAuction") renderMarketAuction();
    else if (currentView === "studentDb") renderStudentDb();
    else if (currentView === "loanConsultants") renderLoanConsultants();
    else if (currentView === "caselaw") renderCaselaw();
    else if (currentView === "blog") renderBlog();
    else if (currentView === "team") renderAiTeam();
    else if (currentView === "schedule") renderSchedule();
    else if (currentView === "workReports") renderWorkReports();
    else if (currentView === "tasks") renderTasks();
    else if (currentView === "backup") renderBackup();
    renderWorkDrawer();
  }

  function initCloudSync() {
    if (!window.claude || !window.claude.mcp) return;
    // 이미 실제 데이터를 갖고 있는 기기는 원본을 받은 것과 같다. 저장이 막히면 안 된다.
    if (!state.meta.cloudPulledOnce && coreItemCount() >= CORE_ITEMS_MIN_FOR_SAVE) { state.meta.cloudPulledOnce = true; persistLocal(); }
    driveAutoSyncCheck({ notify: true, pushIfEmpty: true, onDone: function () {
      mergeBankImportChunksIfNeeded(function () {
        mergeStudentDbChunksIfNeeded(function () { cleanupStudentDbLinkMemoIfNeeded(); backfillStudentDbLinksIfNeeded(); backfillConsultingCourseFlagIfNeeded(); backfillStudentPaidDateIfNeeded(); addJulyRosterIfNeeded(); enforceDepositBasedRevenueV1(); fixRecurringLumpSumStudentsV1(); fixSingleTransactionTuitionAmountsV1(); reconcileRemainingBundledTuitionV1(); clearMarketAuctionsOnceV1(); excludeBulkImportedStudentsFromNewCountV1(); seedCaselawResourcesV1(); mergeStudentDbAdditionChunksIfNeeded(); mergeBlogTrashChunksIfNeeded(); mergeBlogDraftChunksIfNeeded(); mergeMarketChunksIfNeeded(); mergeBankAdditionChunksIfNeeded(function () { mergeStudentAdditionChunksIfNeeded(function () { mergeGenericPatchChunksIfNeeded(); }); }); mergeStudentTuitionPatchChunksIfNeeded(); mergeCourseStartDatePatchChunksIfNeeded(); mergeKpiLogChunksIfNeeded(); mergeBankCategoryPatchChunksIfNeeded(); mergeStudentDeleteChunksIfNeeded(); mergeBankCategoryOverrideChunksIfNeeded(); mergeInstallmentAdditionChunksIfNeeded(); mergeRevenueUnconfirmChunksIfNeeded(); mergeRevenueReconfirmChunksIfNeeded(); mergeRevenueLinkFixChunksIfNeeded(); mergeLoanConsultantChunksIfNeeded(); mergeCarouselChunksIfNeeded(); mergeMarketResearchChunksIfNeeded(); mergeContentIdeaChunksIfNeeded(); mergeBrandStrategyChunksIfNeeded(); mergeWorkLogDocsIfNeeded(); });
      });
    } });
    setInterval(function () { driveAutoSyncCheck({ notify: true }); mergeStudentDbAdditionChunksIfNeeded(); mergeBlogTrashChunksIfNeeded(); mergeBlogDraftChunksIfNeeded(); mergeMarketChunksIfNeeded(); mergeBankAdditionChunksIfNeeded(function () { mergeStudentAdditionChunksIfNeeded(function () { mergeGenericPatchChunksIfNeeded(); }); }); mergeStudentTuitionPatchChunksIfNeeded(); mergeCourseStartDatePatchChunksIfNeeded(); mergeKpiLogChunksIfNeeded(); mergeBankCategoryPatchChunksIfNeeded(); mergeStudentDeleteChunksIfNeeded(); mergeBankCategoryOverrideChunksIfNeeded(); mergeInstallmentAdditionChunksIfNeeded(); mergeRevenueUnconfirmChunksIfNeeded(); mergeRevenueReconfirmChunksIfNeeded(); mergeRevenueLinkFixChunksIfNeeded(); mergeLoanConsultantChunksIfNeeded(); mergeCarouselChunksIfNeeded(); mergeMarketResearchChunksIfNeeded(); mergeContentIdeaChunksIfNeeded(); mergeBrandStrategyChunksIfNeeded(); mergeWorkLogDocsIfNeeded(); }, CLOUD_AUTO_PULL_INTERVAL_MS);
    document.addEventListener("visibilitychange", function () {
      if (document.visibilityState === "hidden") {
        if (cloudAutoSaveTimer) {
          clearTimeout(cloudAutoSaveTimer);
          cloudAutoSaveTimer = null;
          driveSaveSnapshot(null, true);
        }
      } else if (document.visibilityState === "visible") {
        driveAutoSyncCheck({ notify: true });
        mergeStudentDbAdditionChunksIfNeeded();
        mergeBlogTrashChunksIfNeeded();
        mergeBlogDraftChunksIfNeeded();
        mergeMarketChunksIfNeeded();
        mergeBankAdditionChunksIfNeeded(function () { mergeStudentAdditionChunksIfNeeded(function () { mergeGenericPatchChunksIfNeeded(); }); });
        mergeStudentTuitionPatchChunksIfNeeded(); mergeCourseStartDatePatchChunksIfNeeded(); mergeKpiLogChunksIfNeeded();
        mergeBankCategoryPatchChunksIfNeeded();
        mergeStudentDeleteChunksIfNeeded();
        mergeBankCategoryOverrideChunksIfNeeded(); mergeInstallmentAdditionChunksIfNeeded(); mergeRevenueUnconfirmChunksIfNeeded(); mergeRevenueReconfirmChunksIfNeeded(); mergeRevenueLinkFixChunksIfNeeded();
        mergeLoanConsultantChunksIfNeeded();
        mergeCarouselChunksIfNeeded();
        mergeMarketResearchChunksIfNeeded();
        mergeContentIdeaChunksIfNeeded();
        mergeBrandStrategyChunksIfNeeded(); mergeWorkLogDocsIfNeeded();
      }
    });
  }

  render();
  initCloudSync();
})();
