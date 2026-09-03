/* GET /type/{유형코드} — 물건 유형별 경매 페이지
 *
 * 지역 페이지(/area/daegu)가 "대구아파트경매"를 노린다면 이쪽은
 * "아파트경매", "상가경매", "토지경매"처럼 지역이 붙지 않는 검색어를 노린다.
 * 지역 페이지와 마찬가지로 물건이 적으면 내용이 빈약해지므로 3건 미만이면 열지 않는다.
 */
import { SITE, esc, page, html, originOf, organizationLd, breadcrumbLd, itemListLd } from "../_lib/site.js";
import {
  getProperties,
  groupByType,
  groupByRegion,
  typeByCode,
  MIN_PROPERTIES_PER_REGION,
} from "../_lib/properties.js";
import { propertyGrid, ctaSection, answerBlock, faqSection } from "../_lib/ui.js";
import { faqLd } from "../_lib/guides.js";

/* 유형마다 실제로 다른 이야기를 해야 페이지가 서로 베낀 글이 되지 않는다.
 * 각 유형에서 사고가 나는 지점과 확인 항목을 따로 적어 둔다. */
const TYPE_NOTES = {
  apartment: {
    answer:
      "아파트 경매는 <b>시세 확인이 쉬워 초보가 시작하기 가장 좋은 유형</b>입니다. 같은 단지 같은 평형의 실거래가가 그대로 기준이 되기 때문입니다. 대신 경쟁이 많아 낙찰가가 올라가므로, 감정가가 아니라 <b>현재 실거래가에서 비용을 뺀 금액</b>을 상한으로 정해두고 들어가야 합니다.",
    checks: [
      "<b>같은 단지 최근 실거래가</b> — 동·층·향이 비슷한 거래만 골라 비교합니다.",
      "<b>체납관리비</b> — 관리사무소에 확인합니다. 공용부분은 낙찰자 부담이 되는 경우가 많습니다.",
      "<b>점유자</b> — 소유자가 살고 있으면 명도가 가장 수월합니다.",
      "<b>선순위 임차인 유무</b> — 전입일자가 말소기준권리보다 빠르면 보증금을 인수할 수 있습니다.",
    ],
    faq: [
      {
        q: "아파트 경매는 초보가 해도 되나요?",
        a: "유형 중에서는 가장 안전합니다. 실거래가로 시세를 정확히 알 수 있고 팔기도 쉽기 때문입니다. 다만 그만큼 경쟁이 많아 무리한 입찰가를 쓰기 쉬우므로, 계산한 상한선을 종이에 적어 가는 것이 중요합니다.",
      },
      {
        q: "아파트 경매에서 대출은 얼마나 나오나요?",
        a: "지역 규제와 본인의 보유 주택 수, 소득에 따라 크게 달라집니다. 낙찰 후에 알아보면 늦으므로 입찰 전에 금융기관 두세 곳에 물건 정보를 주고 한도를 확인해 두셔야 합니다.",
      },
    ],
  },
  officetel: {
    answer:
      "오피스텔 경매는 아파트와 비슷해 보이지만 <b>주거용이냐 업무용이냐에 따라 세금과 임차인 보호가 달라집니다.</b> 주거용으로 쓰이면 주택임대차보호법이 적용되어 임차인 대항력을 따져야 하고, 취득세와 주택 수 산정도 실제 사용 용도에 영향을 받습니다. 공실 위험도 아파트보다 큽니다.",
    checks: [
      "<b>실제 용도</b> — 등기·건축물대장상 업무시설이라도 주거용으로 쓰이면 임차인 보호를 받습니다.",
      "<b>공실률과 임대 시세</b> — 주변 오피스텔 공급이 많으면 팔기도 세를 놓기도 어렵습니다.",
      "<b>관리비 수준</b> — 아파트보다 평당 관리비가 높은 경우가 많습니다.",
      "<b>주택 수 산정</b> — 본인의 다른 부동산과 합쳐 세금이 달라질 수 있어 미리 확인이 필요합니다.",
    ],
    faq: [
      {
        q: "오피스텔은 주택 수에 포함되나요?",
        a: "주거용으로 사용하는지에 따라 달라지고 세목(취득세·종부세·양도세)마다 기준이 다릅니다. 본인의 보유 현황과 함께 세무 상담을 받아 확인하시는 것이 안전합니다.",
      },
    ],
  },
  villa: {
    answer:
      "빌라(다세대·연립) 경매는 <b>시세를 정확히 알기 어려운 것이 가장 큰 위험</b>입니다. 같은 건물이라도 거래가 드물어 비교 대상이 없고, 감정가가 실제 거래 가능한 가격보다 높게 잡혀 있는 경우가 많습니다. 인근 중개사무소에서 \"지금 내놓으면 실제로 얼마에 빠지는지\"를 반드시 확인하고 들어가야 합니다.",
    checks: [
      "<b>실거래 사례</b> — 같은 건물·인근 빌라의 최근 거래를 찾습니다. 없으면 그 자체가 위험 신호입니다.",
      "<b>중개사무소 확인</b> — 호가가 아니라 실제 매도 가능 가격을 물어봅니다.",
      "<b>전세 사기 이력</b> — 보증금이 시세에 가까운 물건은 구조를 꼼꼼히 봐야 합니다.",
      "<b>건물 상태</b> — 누수·결로·주차가 매도 속도를 좌우합니다.",
    ],
    faq: [
      {
        q: "빌라 경매는 왜 위험하다고 하나요?",
        a: "싸게 낙찰받아도 팔리지 않으면 수익이 아니기 때문입니다. 거래가 드물어 시세 판단이 어렵고, 감정가가 실제 매도 가능 가격보다 높게 잡히는 경우가 많습니다. 매도까지 걸리는 기간과 그동안의 이자를 반드시 비용에 넣으세요.",
      },
    ],
  },
  store: {
    answer:
      "상가 경매는 <b>건물이 아니라 임대수익을 사는 것</b>입니다. 판단 기준은 시세가 아니라 실제로 받을 수 있는 월세와 공실 기간입니다. 또 상가임대차보호법이 적용되는 임차인은 계약갱신요구권과 권리금 회수 문제가 얽혀 있어, 주택보다 명도가 까다로운 경우가 많습니다.",
    checks: [
      "<b>현재 임대차 조건</b> — 보증금·월세·계약 잔여기간을 확인합니다.",
      "<b>공실 기간</b> — 주변 상가 공실이 많으면 낙찰 후 몇 달간 수익이 0입니다.",
      "<b>업종 제한과 관리규약</b> — 원하는 업종이 못 들어가는 경우가 있습니다.",
      "<b>유치권 신고</b> — 인테리어·공사대금을 이유로 한 유치권 주장이 상가에서 특히 자주 나옵니다.",
      "<b>부가가치세</b> — 상가는 건물분 부가세가 별도로 발생할 수 있습니다.",
    ],
    faq: [
      {
        q: "상가 경매에서 기존 임차인은 어떻게 되나요?",
        a: "상가임대차보호법상 대항요건(인도+사업자등록)을 갖춘 임차인이 말소기준권리보다 앞서면 낙찰자가 임대차를 승계합니다. 계약갱신요구권이 남아 있으면 바로 비울 수 없으므로, 명도 계획을 세우기 전에 임대차 관계를 먼저 확인해야 합니다.",
      },
      {
        q: "상가 수익률은 어떻게 계산하나요?",
        a: "연 임대료에서 관리비·세금·공실 손실을 뺀 순수익을, 낙찰가에 취득 부대비용과 수리비를 더한 총투자금으로 나눕니다. 표시된 수익률은 공실이 없다는 가정인 경우가 많으니 공실 기간을 꼭 반영하세요.",
      },
    ],
  },
  house: {
    answer:
      "단독·다가구 주택 경매는 <b>토지 가치가 실질</b>인 경우가 많습니다. 건물이 오래되었다면 사실상 땅값으로 판단해야 하고, 용도지역과 건폐율·용적률에 따라 값이 크게 갈립니다. 여러 세대가 살고 있으면 임차인마다 대항력을 따로 따져야 해 권리분석 난도가 올라갑니다.",
    checks: [
      "<b>토지이용계획</b> — 용도지역·도로 접함 여부가 가치를 결정합니다.",
      "<b>세대별 임차인 전부</b> — 다가구는 임차인이 여러 명이라 각각 전입일자·확정일자·배당요구를 확인해야 합니다.",
      "<b>건물 등기 여부</b> — 미등기 건물이나 무허가 증축이 있으면 문제가 됩니다.",
      "<b>토지와 건물 소유자 일치 여부</b> — 다르면 법정지상권을 따져야 합니다.",
    ],
    faq: [
      {
        q: "다가구주택 경매에서 임차인이 여러 명이면 어떻게 되나요?",
        a: "임차인 각각에 대해 전입일자·확정일자·보증금·배당요구 여부를 따져야 합니다. 말소기준권리보다 앞선 임차인의 보증금 중 배당으로 회수되지 않는 금액은 낙찰자가 인수합니다. 인원이 많을수록 인수 금액이 커질 수 있으니 전부 합산해 입찰가에서 빼야 합니다.",
      },
    ],
  },
  land: {
    answer:
      "토지 경매는 <b>가장 어렵고 가장 오래 걸리는 유형</b>입니다. 시세라 할 것이 없고, 같은 면적이라도 도로에 접했는지·용도지역이 무엇인지·개발행위허가가 나는지에 따라 가치가 몇 배 차이 납니다. 분묘기지권과 법정지상권처럼 등기에 없는 권리도 자주 등장합니다.",
    checks: [
      "<b>도로 접함(맹지 여부)</b> — 도로에 닿지 않으면 건축이 어렵고 값이 크게 떨어집니다.",
      "<b>용도지역·지구</b> — 토지이용계획확인원으로 무엇을 지을 수 있는지 확인합니다.",
      "<b>현황과 지목의 불일치</b> — 지목은 대지인데 실제로는 도로로 쓰이는 경우가 있습니다.",
      "<b>분묘</b> — 묘가 있으면 함부로 옮길 수 없습니다. 반드시 현장에 가 보세요.",
      "<b>농지</b> — 농지취득자격증명이 필요하며 기한 내 제출하지 못하면 보증금을 잃을 수 있습니다.",
    ],
    faq: [
      {
        q: "농지를 경매로 낙찰받으려면 무엇이 필요한가요?",
        a: "농지취득자격증명(농취증)이 필요합니다. 매각결정기일까지 법원에 제출하지 못하면 매각이 불허가되고 보증금을 돌려받지 못할 수 있습니다. 입찰 전에 해당 지자체에 발급 가능 여부를 먼저 확인하셔야 합니다.",
      },
      {
        q: "맹지는 사면 안 되나요?",
        a: "건축이 어려워 값이 낮게 형성됩니다. 인접 토지를 함께 확보하거나 도로 사용 승낙을 받을 방법이 확실할 때만 의미가 있습니다. 그런 계획 없이 싸다는 이유로 들어가면 팔지 못하는 땅이 됩니다.",
      },
    ],
  },
  factory: {
    answer:
      "공장·창고 경매는 <b>기계설비가 포함되는지, 명도에 얼마가 드는지</b>가 승부처입니다. 감정평가서에 기계기구가 포함되었는지 확인해야 하고, 설비와 재고를 빼는 강제집행 비용이 주거용과 비교가 안 되게 큽니다. 매수자가 한정돼 되파는 데도 오래 걸립니다.",
    checks: [
      "<b>기계기구 포함 여부</b> — 감정평가서 목록을 확인합니다. 별도 소유일 수 있습니다.",
      "<b>명도 비용</b> — 설비·재고 반출 비용이 수천만 원 단위가 될 수 있습니다.",
      "<b>인허가와 업종</b> — 공장등록·환경 인허가가 승계되는지 확인이 필요합니다.",
      "<b>오염 여부</b> — 토양오염이 확인되면 정화 책임이 문제 됩니다.",
      "<b>유치권</b> — 공사대금 관련 유치권 주장이 특히 잦습니다.",
    ],
    faq: [
      {
        q: "공장 경매에서 기계설비도 같이 낙찰받나요?",
        a: "감정평가와 매각 목록에 포함된 것만 낙찰 대상입니다. 목록에 없는 기계는 제3자 소유일 수 있고, 그 경우 반출을 두고 분쟁이 생깁니다. 감정평가서의 기계기구 목록을 반드시 확인하세요.",
      },
    ],
  },
  lodging: {
    answer:
      "모텔·호텔·펜션 같은 숙박시설 경매는 <b>영업이 이어지느냐가 전부</b>입니다. 건물 가치보다 매출과 인허가 승계가 중요하고, 시설이 낡았다면 리모델링 비용이 낙찰가만큼 나오기도 합니다. 매수자층이 좁아 되파는 데 시간이 오래 걸립니다.",
    checks: [
      "<b>영업신고 승계</b> — 숙박업 인허가가 넘어오는지 관할 시군구에 확인합니다.",
      "<b>실제 매출</b> — 객실 수·가동률·주변 경쟁 시설을 봅니다.",
      "<b>시설 노후도</b> — 객실 리모델링 비용이 크게 듭니다.",
      "<b>기존 운영자와의 관계</b> — 임차 운영 중이면 명도가 쉽지 않습니다.",
    ],
    faq: [
      {
        q: "숙박시설을 낙찰받으면 영업을 바로 할 수 있나요?",
        a: "인허가 승계와 시설 기준 충족 여부에 따라 다릅니다. 관할 시군구에 미리 확인하지 않으면 낙찰 후 영업을 못 하는 상황이 생길 수 있습니다.",
      },
    ],
  },
  multi: {
    answer:
      "다가구주택 경매는 <b>임차인이 여러 명</b>이라는 점이 핵심입니다. 세대마다 전입일자·확정일자·보증금·배당요구가 다르고, 말소기준권리보다 앞선 세대의 미배당 보증금은 전부 낙찰자가 인수합니다. 합산액이 낙찰가를 넘기는 경우도 있어 계산 없이는 절대 들어가면 안 됩니다.",
    checks: [
      "<b>세대별 임차인 전원</b> — 매각물건명세서의 임차인 목록을 한 줄도 빠뜨리지 않고 정리합니다.",
      "<b>인수 보증금 합계</b> — 선순위 세대의 미배당 예상액을 모두 더합니다.",
      "<b>소액임차인 최우선변제</b> — 배당 순위가 뒤바뀌어 내 배당액이 줄어듭니다.",
      "<b>명도 난도</b> — 세대 수만큼 상대해야 합니다.",
    ],
    faq: [
      {
        q: "다가구 경매에서 인수 보증금은 어떻게 계산하나요?",
        a: "말소기준권리보다 앞선 임차인만 골라, 각자의 보증금 중 예상 배당액으로 회수되지 않는 금액을 더합니다. 이 합계를 입찰가에서 빼야 실제 부담액이 나옵니다. 계산이 복잡하므로 첫 물건이라면 확인받고 들어가시길 권합니다.",
      },
    ],
  },
};

export async function onRequestGet(context) {
  const { request, params } = context;
  const origin = originOf(request);
  const code = String(params.kind || "").toLowerCase();
  const type = typeByCode(code);

  const notFound = (msg) =>
    html(
      page({
        origin,
        path: `/type/${encodeURIComponent(code)}`,
        title: "준비 중인 유형입니다 | " + SITE.name,
        description: "아직 이 유형의 경매 물건이 준비되지 않았습니다.",
        noindex: true,
        body: `<section class="pg-head"><div class="pg-wrap">
            <h1>준비 중인 유형입니다</h1>
            <p class="pg-lead">${esc(msg)}</p>
          </div></section>
          <section class="pg-section"><div class="pg-wrap">
            <div class="pg-actions">
              <a class="button button-dark" href="/type">지금 볼 수 있는 유형 보기</a>
              <a class="button button-outline" href="/area">지역별 물건 보기</a>
            </div>
          </div></section>`,
      }),
      404,
      { "cache-control": "no-store" }
    );

  if (!type) return notFound("주소를 다시 확인해 주세요.");

  let all;
  try {
    all = await getProperties(context);
  } catch {
    return html(
      page({
        origin,
        path: `/type/${code}`,
        title: `${type.name} 경매 물건 | ${SITE.name}`,
        description: "일시적으로 물건 정보를 불러오지 못했습니다.",
        noindex: true,
        body: `<section class="pg-head"><div class="pg-wrap">
          <h1>물건 정보를 잠시 불러올 수 없습니다</h1>
          <p class="pg-lead">잠시 후 다시 시도해 주세요.</p></div></section>`,
      }),
      503,
      { "cache-control": "no-store", "retry-after": "300" }
    );
  }

  const mine = groupByType(all).find((g) => g.type.code === code);
  const items = mine ? mine.items : [];

  if (items.length < MIN_PROPERTIES_PER_REGION) {
    return notFound(
      `${type.name} 물건은 아직 ${items.length}건이라 페이지를 열지 않았습니다. ${MIN_PROPERTIES_PER_REGION}건 이상 모이면 자동으로 공개됩니다.`
    );
  }

  const note = TYPE_NOTES[code] || { answer: "", checks: [], faq: [] };

  // 이 유형 안에서 지역별로 몇 건인지 — 지역 페이지로 걸어 들어가는 내부 링크를 만든다.
  const byRegion = groupByRegion(items);
  const regionChips = byRegion
    .map((g) =>
      g.items.length >= MIN_PROPERTIES_PER_REGION
        ? `<a class="pg-chip" href="/area/${g.region.code}">${esc(g.region.name)} ${esc(type.name)} <span>${g.items.length}</span></a>`
        : `<span class="pg-chip is-off">${esc(g.region.name)} <span>${g.items.length}</span></span>`
    )
    .join("");

  const faq = note.faq || [];

  const body = `
<section class="pg-head">
  <div class="pg-wrap">
    <nav class="pg-crumbs" aria-label="현재 위치">
      <a href="/">홈</a> <span>›</span> <a href="/type">유형별 물건</a> <span>›</span> <em>${esc(type.name)}</em>
    </nav>
    <span class="pg-badge">진행 중 ${items.length}건</span>
    <h1>${esc(type.name)} <em>경매 물건</em></h1>
    <p class="pg-lead">전국에서 진행 중인 ${esc(type.name)} 경매 물건을 모았습니다.
    ${byRegion.length ? `현재 ${esc(byRegion.map((g) => g.region.name).slice(0, 5).join(", "))} 지역 물건이 올라와 있습니다. ` : ""}
    각 물건은 실제 임장과 권리분석을 거쳐 정리한 내용을 연결해 두었습니다.</p>
  </div>
</section>

${note.answer ? answerBlock(`${type.name} 경매, 무엇을 먼저 봐야 하나요?`, note.answer) : ""}

<section class="pg-section">
  <div class="pg-wrap">
    <div class="pg-kicker">Properties</div>
    <h2 class="pg-title">진행 중인 <em>${esc(type.name)} 경매 물건</em></h2>
    <p class="pg-desc">감정가·최저매각가는 블로그 분석 글에서 가져온 값입니다.
    사건번호·매각기일 등 법원 정보는 각 물건의 원문 링크에서 확인해 주세요.</p>
    ${propertyGrid(items)}
  </div>
</section>

${note.checks && note.checks.length ? `<section class="pg-section ink">
  <div class="pg-wrap">
    <div class="pg-kicker">Checklist</div>
    <h2 class="pg-title">${esc(type.name)} 경매에서 <em>꼭 확인할 것</em></h2>
    <ul class="pg-checks">${note.checks.map((c) => `<li>${c}</li>`).join("")}</ul>
    <div class="pg-actions">
      <a class="button button-primary" href="/guide/malso-standard">권리분석 기초부터 보기</a>
    </div>
  </div>
</section>` : ""}

<section class="pg-section">
  <div class="pg-wrap">
    <div class="pg-kicker">Regions</div>
    <h2 class="pg-title">지역별 <em>${esc(type.name)} 물건</em></h2>
    ${regionChips ? `<div class="pg-chips">${regionChips}</div>` : '<p class="pg-desc">지역 정보가 확인된 물건이 아직 없습니다.</p>'}
    <div class="pg-actions"><a class="button button-dark" href="/area">지역 전체 보기</a></div>
  </div>
</section>

${faqSection(faq, `${type.name} 경매 자주 묻는 질문`)}

${ctaSection()}`;

  return html(
    page({
      origin,
      path: `/type/${code}`,
      title: `${type.name} 경매 물건 ${items.length}건 — 감정가·최저가 정리 | ${SITE.name}`,
      description: `전국 ${type.name} 경매 물건 ${items.length}건. ${
        byRegion.length ? byRegion.map((g) => g.region.name).slice(0, 3).join(", ") + " 등 " : ""
      }감정가·최저매각가와 ${type.name} 경매에서 확인할 점을 함께 정리했습니다.`,
      keywords: `${type.name}경매,${type.name}경매물건,${type.name}낙찰,부동산경매,경매물건검색`,
      image: items[0] && items[0].thumbnail ? items[0].thumbnail : undefined,
      jsonLd: [
        organizationLd(origin),
        breadcrumbLd(
          [
            { name: "홈", path: "/" },
            { name: "유형별 물건", path: "/type" },
            { name: `${type.name} 경매`, path: `/type/${code}` },
          ],
          origin
        ),
        itemListLd(items, origin),
        faqLd(faq),
      ],
      body,
    })
  );
}
