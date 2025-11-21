import os
import base64  
import requests
from pypdf import PdfReader
from docx import Document as DocxDocument
from PIL import Image
import pytesseract

pytesseract.pytesseract.tesseract_cmd = r'C:\Program Files\Tesseract-OCR\tesseract.exe'

class TextExtractor:
    """
    파일 확장자에 따라 적절한 방식으로 텍스트를 추출하는 클래스
    """
    
    @staticmethod
    def extract(file_path):
        """
        파일 경로를 받아 텍스트를 반환합니다.
        """
        if not os.path.exists(file_path):
            return ""
            
        ext = os.path.splitext(file_path)[1].lower()
        
        try:
            if ext == '.pdf':
                return TextExtractor._extract_pdf(file_path)
            elif ext in ['.docx', '.doc']:
                return TextExtractor._extract_docx(file_path)
            elif ext in ['.jpg', '.jpeg', '.png', '.bmp', '.webp']:
                return TextExtractor._extract_image_hybrid(file_path)
            elif ext == '.txt':
                return TextExtractor._extract_txt(file_path)
            else:
                return f"[지원하지 않는 파일 형식입니다: {ext}]"
        except Exception as e:
            print(f"[Extractor Error] Failed to extract {file_path}: {e}")
            return ""

    @staticmethod
    def _extract_pdf(file_path):
        text = ""
        reader = PdfReader(file_path)
        for page in reader.pages:
            text += page.extract_text() + "\n"
        return text

    @staticmethod
    def _extract_docx(file_path):
        doc = DocxDocument(file_path)
        return "\n".join([para.text for para in doc.paragraphs])

    @staticmethod
    def _extract_txt(file_path):
        with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
            return f.read()
        
    @staticmethod
    def _extract_image_hybrid(file_path):
        results = []
        
        # 1. OCR (글자 읽기)
        try:
            ocr_text = pytesseract.image_to_string(Image.open(file_path), lang='kor+eng')
            if ocr_text.strip():
                results.append(f"[텍스트 추출 결과]\n{ocr_text.strip()}")
            else:
                print("[Extractor] OCR result is empty.")
        except Exception as e:
            print(f"[Extractor] OCR failed: {e}")

        # 2. Vision LLM (이미지 묘사)
        try:
            description = TextExtractor._call_ollama_vision(file_path)
            if description:
                results.append(f"[이미지 분석 결과]\n{description}")
        except Exception as e:
            print(f"[Extractor] Vision LLM failed: {e}")
            
        return "\n\n".join(results)
    
    @staticmethod
    def _call_ollama_vision(file_path):
        """
        Ollama의 gemma3 모델에게 이미지를 보내 '객관적 사실' 위주의 묘사를 요청합니다.
        """
        OLLAMA_ENDPOINT = "http://localhost:11434/api/generate"
        
        # 이미지를 base64로 인코딩
        with open(file_path, "rb") as image_file:
            base64_image = base64.b64encode(image_file.read()).decode('utf-8')

        prompt_text = """
        Describe this image in Korean.
        Follow these STRICT rules:
        1. Be purely objective and factual. Do NOT use subjective or emotional adjectives (e.g., 'cute', 'lovely', 'happy').
        2. Focus on visible elements: objects, colors, positions, and actions.
        3. Do NOT add any conversational fillers (e.g., "Here is the description", "Sure"). Start directly with the description content.
        4. Write in a dry, descriptive tone suitable for a database entry.
        """

        payload = {
            "model": "gemma3:4b", 
            "prompt": prompt_text,
            "images": [base64_image], 
            "stream": False,
            "options": {
                "temperature": 0.0 
            }
        }

        try:
            response = requests.post(OLLAMA_ENDPOINT, json=payload, timeout=60)
            response.raise_for_status()
            return response.json().get('response', '').strip()
        except Exception as e:
            print(f"[Extractor] Ollama Vision API Error: {e}")
            return ""