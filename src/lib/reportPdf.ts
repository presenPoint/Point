import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';

/**
 * 화면에 그려진 보고서 DOM을 캡처해 여러 페이지 A4 PDF로 저장합니다.
 * (한글·서체는 브라우저 렌더 그대로 캡처됩니다.)
 */
export async function downloadReportPdfFromElement(
  root: HTMLElement | null,
  fileBaseName: string,
): Promise<void> {
  if (!root) {
    throw new Error('보고서가 아직 화면에 없습니다. 리포트 단계까지 진행한 뒤 다시 시도해 주세요.');
  }

  const canvas = await html2canvas(root, {
    scale: 2,
    useCORS: true,
    allowTaint: true,
    logging: false,
    scrollX: 0,
    scrollY: -window.scrollY,
    windowWidth: root.scrollWidth,
    windowHeight: root.scrollHeight,
    backgroundColor: '#16171d',
  });

  const imgData = canvas.toDataURL('image/jpeg', 0.92);
  const pdf = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4', compress: true });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();

  const imgWidth = pageWidth;
  const imgHeight = (canvas.height * imgWidth) / canvas.width;

  let heightLeft = imgHeight;
  let position = 0;

  pdf.addImage(imgData, 'JPEG', 0, position, imgWidth, imgHeight);
  heightLeft -= pageHeight;

  while (heightLeft > 0) {
    position = heightLeft - imgHeight;
    pdf.addPage();
    pdf.addImage(imgData, 'JPEG', 0, position, imgWidth, imgHeight);
    heightLeft -= pageHeight;
  }

  const safe = fileBaseName.replace(/[^a-zA-Z0-9-_]/g, '').slice(0, 24) || 'session';
  pdf.save(`Point-report-${safe}.pdf`);
}
