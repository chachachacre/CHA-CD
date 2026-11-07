import { PortfolioItem, ContactInfo, PortfolioSettings } from "./types";

export const initialPortfolioItems: PortfolioItem[] = [];

export const initialContactInfo: ContactInfo = {
  email: "cha.cd@brandcreative.com",
  phone: "+82-2-1234-5678",
  instagram: "cha_cd_creative",
  linkedin: "linkedin.com/in/cha-cd-creative",
  officeAddress: "서울특별시 강남구 테헤란로 518, 12층 (CHA CD 스튜디오)",
};

export const initialPortfolioSettings: PortfolioSettings = {
  pdfUrl: "https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf",
  pdfFileName: "CHA_CD_Portfolio_2026_Full.pdf",
  introduction: "좋은 광고는 예산보다 아이디어와 디렉팅에서 시작됩니다.\n실사 촬영 광고부터 AI 광고, 디지털 콘텐츠, 지면 제작까지.\n프로젝트에 가장 적합한 방식으로 브랜드가 기대하는 그 이상의 결과를 만듭니다.",
  rateCardUrl: "/uploads/CHA_CD_Rate_Card_2026.pdf",
  rateCardFileName: "CHA_CD_Rate_Card_2026.pdf",
  rateCardTitle: "제작 단가표 (Rate Card)",
  rateCardNote: "AI 영상 제작, 실사 광고, 디지털 콘텐츠 제작 단가 및 가이드라인입니다.",
};
