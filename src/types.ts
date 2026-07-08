export interface PortfolioItem {
  id: string;
  title: string;
  client: string;
  videoUrl: string;
  thumbnailUrl: string;
  year: string;
  description?: string;
  order: number;
}

export interface ContactInfo {
  email: string;
  phone: string;
  instagram?: string;
  linkedin?: string;
  officeAddress?: string;
}

export interface PortfolioSettings {
  pdfUrl: string;
  pdfFileName: string;
  introduction?: string;
}
