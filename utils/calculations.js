const numberToWords = (num) => {
    const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine'];
    const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
    const teens = ['Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
    
    function convertHundreds(n) {
      if (n > 99) {
        return ones[Math.floor(n / 100)] + ' Hundred' + (n % 100 !== 0 ? ' ' + convertTens(n % 100) : '');
      } else {
        return convertTens(n);
      }
    }
    
    function convertTens(n) {
      if (n < 10) return ones[n];
      if (n >= 10 && n < 20) return teens[n - 10];
      if (n >= 20) {
        return tens[Math.floor(n / 10)] + (n % 10 !== 0 ? ' ' + ones[n % 10] : '');
      }
    }
    
    function convertMillions(n) {
      if (n >= 1000000) {
        return convertMillions(Math.floor(n / 1000000)) + ' Million' + (n % 1000000 !== 0 ? ' ' + convertThousands(n % 1000000) : '');
      } else {
        return convertThousands(n);
      }
    }
    
    function convertThousands(n) {
      if (n >= 1000) {
        return convertHundreds(Math.floor(n / 1000)) + ' Thousand' + (n % 1000 !== 0 ? ' ' + convertHundreds(n % 1000) : '');
      } else {
        return convertHundreds(n);
      }
    }
    
    if (num === 0) return 'Zero Rupees Only';
    
    const rupees = Math.floor(num);
    const paise = Math.round((num - rupees) * 100);
    
    let result = convertMillions(rupees) + ' Rupees';
    
    if (paise > 0) {
      result += ' and ' + convertTens(paise) + ' Paise';
    }
    
    return result + ' Only';
  };
  
  // Calculate weight from dimensions
  const calculateWeight = (thickness, width, length, density = 8.96) => {
    const volume = thickness * width * length; // mm³
    return (volume * density) / 1000000; // Convert to kg
  };
  
  // Calculate effective raw material rate
  const calculateEffectiveRMRate = (ratePerKG, scrapPercentage, transportLossPercentage) => {
    const totalPercentage = (scrapPercentage + transportLossPercentage) / 100;
    return ratePerKG * (1 + totalPercentage);
  };
  
  // Calculate GST type based on states
  const calculateGSTType = (companyStateCode, customerStateCode) => {
    return companyStateCode !== customerStateCode ? 'IGST' : 'CGST+SGST';
  };
  
  // Calculate GST percentages
  const calculateGSTPercentages = (gstType, totalGSTPercentage) => {
    if (gstType === 'IGST') {
      return {
        igst: totalGSTPercentage,
        cgst: 0,
        sgst: 0
      };
    } else {
      const half = totalGSTPercentage / 2;
      return {
        igst: 0,
        cgst: half,
        sgst: half
      };
    }
  };
  
  // Generate quotation number
  const generateQuotationNumber = async (QuotationModel) => {
    const currentYear = new Date().getFullYear();
    const lastQuotation = await QuotationModel.findOne({
      QuotationNo: new RegExp(`^QT/${currentYear}/`)
    }).sort({ CreatedAt: -1 });
    
    let sequence = 1;
    if (lastQuotation) {
      const lastSeq = parseInt(lastQuotation.QuotationNo.split('/').pop());
      if (!isNaN(lastSeq)) {
        sequence = lastSeq + 1;
      }
    }
    
    return `QT/${currentYear}/${sequence.toString().padStart(4, '0')}`;
  };
  
  module.exports = {
    numberToWords,
    calculateWeight,
    calculateEffectiveRMRate,
    calculateGSTType,
    calculateGSTPercentages,
    generateQuotationNumber
  };