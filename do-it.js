const BrokerLedger = require('../models/BrokerLedger');
const Broker = require('../models/Broker');
const Booking = require('../models/Booking');
const Bank = require('../models/Bank');
const CashLocation = require('../models/cashLocation');
const BankSubPaymentMode = require('../models/BankSubPaymentMode');
const mongoose = require('mongoose');
const Ledger = require('../models/Ledger');

// Import calculateBrokerCommission from bookingController
const { calculateBrokerCommission } = require('./bookingController');

exports.initializeLedger = async (brokerId, branchId, userId) => {
  try {
    const existingLedger = await BrokerLedger.findOne({ 
      broker: brokerId, 
      branch: branchId 
    });
    if (!existingLedger) {
      const newLedger = await BrokerLedger.create({
        broker: brokerId,
        branch: branchId,
        currentBalance: 0,
        createdBy: userId
      });
      return newLedger;
    }
    return existingLedger;
  } catch (error) {
    console.error('Error initializing ledger:', error);
    throw error;
  }
};

const autoAllocateOnAccountFunds = async (ledger, userId) => {
  try {
    // First, ensure we have a fully populated ledger
    const populatedLedger = await BrokerLedger.findById(ledger._id)
      .populate('transactions.allocations.booking')
      .populate('transactions.booking');
    
    if (!populatedLedger) return ledger;

    // Get available on-account balance
    const availableOnAccount = populatedLedger.onAccountBalance;
    
    if (availableOnAccount <= 0) return populatedLedger;

    // Get all exchange bookings for this broker (first come first serve)
    const exchangeBookings = await getExchangeBookingsForBroker(
      populatedLedger.broker, 
      populatedLedger.branch
    );
    
    let remainingOnAccount = availableOnAccount;
    const allocations = [];
    
    for (const booking of exchangeBookings) {
      if (remainingOnAccount <= 0) break;
      
      const exchangeAmount = Number(booking.exchangeDetails.price || 0);
      const commission = await calculateBrokerCommission(
        populatedLedger.broker, 
        exchangeAmount, 
        populatedLedger.branch
      );
      
      const totalRequired = exchangeAmount + commission;
      const allocationAmount = Math.min(remainingOnAccount, totalRequired);
      
      if (allocationAmount > 0) {
        // Find credit transactions with remaining balance (FIFO order)
        const creditTransactions = await findCreditsForAllocationFIFO(populatedLedger, allocationAmount);
        
        let amountToAllocate = allocationAmount;
        
        for (const creditTx of creditTransactions) {
          if (amountToAllocate <= 0) break;
          
          // Find the transaction in the populatedLedger using the _id
          const creditTransaction = populatedLedger.transactions.find(
            t => t._id.toString() === creditTx._id.toString()
          );
          
          if (creditTransaction) {
            const remainingCredit = creditTx.amount - (creditTx.allocations?.reduce((sum, alloc) => sum + alloc.amount, 0) || 0);
            const allocationForThisTx = Math.min(amountToAllocate, remainingCredit);
            
            if (allocationForThisTx > 0) {
              // Add allocation to credit transaction
              creditTransaction.allocations.push({
                booking: booking._id,
                amount: allocationForThisTx,
                date: new Date(),
                allocationType: 'AUTO'
              });

              // Update the remaining amount to allocate
              amountToAllocate -= allocationForThisTx;
              remainingOnAccount -= allocationForThisTx;

              // Calculate total allocated amount for this transaction
              const allocatedAmount = creditTransaction.allocations.reduce(
                (sum, alloc) => sum + (alloc.amount || 0), 0
              );
              
              // Update auto allocation status
              if (allocatedAmount >= creditTransaction.amount) {
                creditTransaction.autoAllocationStatus = 'COMPLETED';
              } else if (allocatedAmount > 0) {
                creditTransaction.autoAllocationStatus = 'PARTIAL';
              }
              
              allocations.push({
                bookingNumber: booking.bookingNumber,
                allocatedAmount: allocationForThisTx,
                exchangeAmount,
                commission
              });
              
              console.log(`Auto-allocated ${allocationForThisTx} to booking ${booking.bookingNumber} from reference ${creditTransaction.referenceNumber}`);
            }
          }
        }
      }
    }
    
    console.log(`Auto-allocation completed. Allocations made: ${allocations.length}, Remaining on-account: ${remainingOnAccount}`);
  
    populatedLedger.markModified('transactions');
    
    return populatedLedger;
  } catch (error) {
    console.error('Error in auto-allocation:', error);
    return ledger;
  }
};

// Helper function to find credits for allocation in FIFO order
const findCreditsForAllocationFIFO = async (ledger, amountNeeded) => {
  // Get all approved credit transactions with remaining balance, sorted by date (oldest first)
  const creditTransactions = ledger.transactions
    .filter(tx => 
      tx.type === 'CREDIT' && 
      tx.isOnAccount && 
      tx.approvalStatus === 'Approved'
    )
    .map(tx => {
      const allocated = tx.allocations.reduce((sum, alloc) => sum + alloc.amount, 0);
      const remaining = tx.amount - allocated;
      return {
        ...tx.toObject(),
        remaining
      };
    })
    .filter(tx => tx.remaining > 0)
    .sort((a, b) => new Date(a.date) - new Date(b.date)); // Oldest first (FIFO)
  
  return creditTransactions;
};

exports.getPendingCreditTransactions = async (req, res) => {
  try {
    const { page = 1, limit = 20, branchId, brokerId } = req.query;
    const skip = (page - 1) * limit;
    
    // Build base filter for ledgers
    const baseFilter = {};
    
    // Add branch filter if provided
    if (branchId && mongoose.isValidObjectId(branchId)) {
      baseFilter.branch = branchId;
    }
    
    // Add broker filter if provided
    if (brokerId && mongoose.isValidObjectId(brokerId)) {
      baseFilter.broker = brokerId;
    }
    
    // Use aggregation to properly filter transactions
    const aggregationPipeline = [
      { $match: baseFilter },
      { $unwind: '$transactions' },
      { 
        $match: { 
          'transactions.approvalStatus': 'Pending',
          'transactions.type': 'CREDIT',
          'transactions.isOnAccount': true
        } 
      },
      { $sort: { 'transactions.date': 1 } },
      { $skip: skip },
      { $limit: parseInt(limit) },
      {
        $lookup: {
          from: 'brokers',
          localField: 'broker',
          foreignField: '_id',
          as: 'broker'
        }
      },
      { $unwind: '$broker' },
      {
        $lookup: {
          from: 'branches',
          localField: 'branch',
          foreignField: '_id',
          as: 'branch'
        }
      },
      { $unwind: '$branch' },
      {
        $lookup: {
          from: 'bookings',
          localField: 'transactions.booking',
          foreignField: '_id',
          as: 'transactions.bookingDetails'
        }
      },
      { $unwind: { path: '$transactions.bookingDetails', preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          from: 'banks',
          localField: 'transactions.bank',
          foreignField: '_id',
          as: 'transactions.bankDetails'
        }
      },
      { $unwind: { path: '$transactions.bankDetails', preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          from: 'cashlocations',
          localField: 'transactions.cashLocation',
          foreignField: '_id',
          as: 'transactions.cashLocationDetails'
        }
      },
      { $unwind: { path: '$transactions.cashLocationDetails', preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          from: 'banksubpaymentmodes',
          localField: 'transactions.subPaymentMode',
          foreignField: '_id',
          as: 'transactions.subPaymentModeDetails'
        }
      },
      { $unwind: { path: '$transactions.subPaymentModeDetails', preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          from: 'users',
          localField: 'transactions.createdBy',
          foreignField: '_id',
          as: 'transactions.createdByDetails'
        }
      },
      { $unwind: { path: '$transactions.createdByDetails', preserveNullAndEmptyArrays: true } },
      {
        $group: {
          _id: '$_id',
          broker: { $first: '$broker' },
          branch: { $first: '$branch' },
          transactions: { $push: '$transactions' }
        }
      }
    ];

    // Get total count
    const countPipeline = [
      { $match: baseFilter },
      { $unwind: '$transactions' },
      { 
        $match: { 
          'transactions.approvalStatus': 'Pending',
          'transactions.type': 'CREDIT',
          'transactions.isOnAccount': true
        } 
      },
      { $count: 'total' }
    ];

    const [ledgersData, countResult] = await Promise.all([
      BrokerLedger.aggregate(aggregationPipeline),
      BrokerLedger.aggregate(countPipeline)
    ]);

    const totalCount = countResult.length > 0 ? countResult[0].total : 0;

    // Format the response
    const allPendingCredits = [];
    ledgersData.forEach(ledger => {
      if (ledger.transactions && ledger.transactions.length > 0) {
        ledger.transactions.forEach(transaction => {
          const formattedTransaction = {
            ...transaction,
            broker: {
              _id: ledger.broker._id,
              name: ledger.broker.name,
              mobile: ledger.broker.mobile,
              email: ledger.broker.email,
              brokerId: ledger.broker.brokerId
            },
            branch: {
              _id: ledger.branch._id,
              name: ledger.branch.name,
              code: ledger.branch.code
            },
            ledgerId: ledger._id,
            booking: transaction.bookingDetails ? {
              bookingNumber: transaction.bookingDetails.bookingNumber,
              customerName: transaction.bookingDetails.customerDetails ? 
                `${transaction.bookingDetails.customerDetails.salutation || ''} ${transaction.bookingDetails.customerDetails.name || ''}`.trim() : 
                'N/A',
              chassisNumber: transaction.bookingDetails.chassisNumber
            } : null,
            bank: transaction.bankDetails ? {
              _id: transaction.bankDetails._id,
              name: transaction.bankDetails.name
            } : null,
            cashLocation: transaction.cashLocationDetails ? {
              _id: transaction.cashLocationDetails._id,
              name: transaction.cashLocationDetails.name
            } : null,
            subPaymentMode: transaction.subPaymentModeDetails ? {
              _id: transaction.subPaymentModeDetails._id,
              payment_mode: transaction.subPaymentModeDetails.payment_mode
            } : null,
            createdBy: transaction.createdByDetails ? {
              _id: transaction.createdByDetails._id,
              name: transaction.createdByDetails.name
            } : null
          };

          // Remove the temporary populated fields
          delete formattedTransaction.bookingDetails;
          delete formattedTransaction.bankDetails;
          delete formattedTransaction.cashLocationDetails;
          delete formattedTransaction.subPaymentModeDetails;
          delete formattedTransaction.createdByDetails;

          allPendingCredits.push(formattedTransaction);
        });
      }
    });

    res.status(200).json({
      success: true,
      data: {
        pendingCreditTransactions: allPendingCredits,
        pagination: {
          current: parseInt(page),
          total: Math.ceil(totalCount / limit),
          count: allPendingCredits.length,
          totalRecords: totalCount
        }
      }
    });

  } catch (error) {
    console.error('Error fetching pending credit transactions:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Error fetching pending credit transactions'
    });
  }
};

// Get exchange bookings for broker (first come first serve)
const getExchangeBookingsForBroker = async (brokerId, branchId) => {
  const Booking = require('../models/Booking');
  
  // Find all bookings with exchange for this broker, ordered by creation date (oldest first)
  const exchangeBookings = await Booking.find({
    exchange: true,
    'exchangeDetails.broker': brokerId,
    branch: branchId,
    'exchangeDetails.price': { $gt: 0 }
  })
  .populate('customerDetails')
  .populate('modelDetails')
  .sort({ createdAt: 1 }); // Oldest first (first come first serve)
  
  return exchangeBookings;
};

exports.getPendingOnAccountPayments = async (req, res) => {
  try {
    const { page = 1, limit = 20, branchId, brokerId } = req.query;
    const skip = (page - 1) * limit;

    // ---------------------------
    // ROLE-BASED ACCESS CONTROL
    // ---------------------------
    const userRoles = req.user.roles?.map(r => r.name) || [];
    const isSuperAdmin = userRoles.includes("SUPERADMIN") || req.user.isSuperAdmin;

    // Build base filter
    const baseFilter = {};

    if (!isSuperAdmin) {
      // Non-SuperAdmin → restrict to user branch
      if (req.user.branch && mongoose.isValidObjectId(req.user.branch)) {
        baseFilter.branch = req.user.branch;
      }
    } else {
      // SuperAdmin → allow filtering by query
      if (branchId && mongoose.isValidObjectId(branchId)) {
        baseFilter.branch = new mongoose.Types.ObjectId(branchId);
      }
    }

    if (brokerId && mongoose.isValidObjectId(brokerId)) {
      baseFilter.broker = new mongoose.Types.ObjectId(brokerId);
    }

    // ---------------------------
    // MAIN AGGREGATION PIPELINE
    // ---------------------------
    const aggregationPipeline = [
      { $match: baseFilter },
      { $unwind: "$transactions" },
      {
        $match: {
          "transactions.approvalStatus": "Pending",
          "transactions.type": "CREDIT",
          "transactions.isOnAccount": true,
          "transactions.modeOfPayment": { $ne: "Cash" } // Exclude cash payments
        }
      },
      { $sort: { "transactions.date": 1 } },
      { $skip: skip },
      { $limit: parseInt(limit) },
      {
        $lookup: {
          from: "brokers",
          localField: "broker",
          foreignField: "_id",
          as: "broker"
        }
      },
      { $unwind: "$broker" },
      {
        $lookup: {
          from: "branches",
          localField: "branch",
          foreignField: "_id",
          as: "branch"
        }
      },
      { $unwind: "$branch" },
      {
        $lookup: {
          from: "banks",
          localField: "transactions.bank",
          foreignField: "_id",
          as: "transactions.bankDetails"
        }
      },
      { $unwind: { path: "$transactions.bankDetails", preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          from: "banksubpaymentmodes",
          localField: "transactions.subPaymentMode",
          foreignField: "_id",
          as: "transactions.subPaymentModeDetails"
        }
      },
      { $unwind: { path: "$transactions.subPaymentModeDetails", preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          from: "users",
          localField: "transactions.createdBy",
          foreignField: "_id",
          as: "transactions.createdByDetails"
        }
      },
      { $unwind: { path: "$transactions.createdByDetails", preserveNullAndEmptyArrays: true } },
      {
        $group: {
          _id: "$_id",
          broker: { $first: "$broker" },
          branch: { $first: "$branch" },
          transactions: { $push: "$transactions" }
        }
      }
    ];

    // ---------------------------
    // COUNT PIPELINE
    // ---------------------------
    const countPipeline = [
      { $match: baseFilter },
      { $unwind: "$transactions" },
      {
        $match: {
          "transactions.approvalStatus": "Pending",
          "transactions.type": "CREDIT",
          "transactions.isOnAccount": true,
          "transactions.modeOfPayment": { $ne: "Cash" }
        }
      },
      { $count: "total" }
    ];

    const [ledgersData, countResult] = await Promise.all([
      BrokerLedger.aggregate(aggregationPipeline),
      BrokerLedger.aggregate(countPipeline)
    ]);

    const totalCount = countResult.length > 0 ? countResult[0].total : 0;

    // ---------------------------
    // FORMAT RESPONSE
    // ---------------------------
    const pendingOnAccountPayments = [];
    ledgersData.forEach(ledger => {
      if (ledger.transactions && ledger.transactions.length > 0) {
        ledger.transactions.forEach(transaction => {
          pendingOnAccountPayments.push({
            _id: transaction._id,
            amount: transaction.amount,
            modeOfPayment: transaction.modeOfPayment,
            subPaymentMode: transaction.subPaymentModeDetails
              ? {
                  _id: transaction.subPaymentModeDetails._id,
                  payment_mode: transaction.subPaymentModeDetails.payment_mode
                }
              : null,
            referenceNumber: transaction.referenceNumber,
            date: transaction.date,
            remark: transaction.remark,
            createdBy: transaction.createdByDetails
              ? {
                  _id: transaction.createdByDetails._id,
                  name: transaction.createdByDetails.name
                }
              : null,
            broker: {
              _id: ledger.broker._id,
              name: ledger.broker.name,
              mobile: ledger.broker.mobile,
              email: ledger.broker.email,
              brokerId: ledger.broker.brokerId
            },
            branch: {
              _id: ledger.branch._id,
              name: ledger.branch.name,
              code: ledger.branch.code
            },
            bank: transaction.bankDetails
              ? {
                  _id: transaction.bankDetails._id,
                  name: transaction.bankDetails.name
                }
              : null,
            ledgerId: ledger._id
          });
        });
      }
    });

    // ---------------------------
    // RESPONSE
    // ---------------------------
    res.status(200).json({
      success: true,
      data: {
        pendingOnAccountPayments,
        pagination: {
          current: parseInt(page),
          total: Math.ceil(totalCount / limit),
          count: pendingOnAccountPayments.length,
          totalRecords: totalCount,
          hasNext: parseInt(page) < Math.ceil(totalCount / limit),
          hasPrev: parseInt(page) > 1
        },
        userRoles,
        userBranch: req.user.branch || null,
        filteredByBranch: baseFilter.branch || (isSuperAdmin ? "ALL" : req.user.branch)
      }
    });
  } catch (error) {
    console.error("Error fetching pending on-account payments:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Error fetching pending on-account payments",
      error: process.env.NODE_ENV === "development" ? error.stack : undefined
    });
  }
};

// Approve on-account payment
exports.approveOnAccountPayment = async (req, res) => {
  try {
    const { brokerId, branchId, transactionId } = req.params;
    const { remark } = req.body;
    const userId = req.user.id;

    // Find the ledger
    const ledger = await BrokerLedger.findOne({
      broker: brokerId,
      branch: branchId
    });

    if (!ledger) {
      return res.status(404).json({
        success: false,
        message: 'Broker ledger not found'
      });
    }

    // Find the transaction
    const transaction = ledger.transactions.id(transactionId);
    if (!transaction) {
      return res.status(404).json({
        success: false,
        message: 'Transaction not found'
      });
    }

    // Check if transaction is an on-account payment
    if (!transaction.isOnAccount || transaction.type !== 'CREDIT') {
      return res.status(400).json({
        success: false,
        message: 'Transaction is not an on-account payment'
      });
    }

    // Check if transaction is pending approval
    if (transaction.approvalStatus !== 'Pending') {
      return res.status(400).json({
        success: false,
        message: 'Transaction is not pending approval'
      });
    }

    // Update transaction status
    transaction.approvalStatus = 'Approved';
    transaction.approvedBy = userId;
    transaction.approvedAt = new Date();
    
    if (remark) {
      transaction.remark = transaction.remark 
        ? `${transaction.remark} | Approval: ${remark}`
        : `Approval: ${remark}`;
    }

    // Update ledger balance and on-account
    ledger.currentBalance -= transaction.amount;
    ledger.onAccount = (ledger.onAccount || 0) + transaction.amount;

    await ledger.save();

    // Populate the response
    const populatedLedger = await BrokerLedger.findById(ledger._id)
      .populate('broker', 'name mobile')
      .populate('branch', 'name')
      .populate({
        path: 'transactions.booking',
        select: 'bookingNumber customerDetails chassisNumber',
        transform: (doc) => {
          if (!doc) return null;
          return {
            bookingNumber: doc.bookingNumber,
            customerName: doc.customerDetails ? 
              `${doc.customerDetails.salutation || ''} ${doc.customerDetails.name || ''}`.trim() : 
              'N/A',
            chassisNumber: doc.chassisNumber
          };
        }
      })
      .populate('transactions.bank', 'name')
      .populate('transactions.cashLocation', 'name')
      .populate('transactions.subPaymentMode', 'payment_mode')
      .populate('transactions.createdBy', 'name')
      .populate('transactions.approvedBy', 'name')
      .populate('transactions.adjustedAgainst.booking', 'bookingNumber');

    const approvedTransaction = populatedLedger.transactions.id(transactionId);

    res.status(200).json({
      success: true,
      data: {
        transaction: approvedTransaction,
        currentBalance: populatedLedger.currentBalance,
        onAccount: populatedLedger.onAccount || 0,
        onAccountBalance: populatedLedger.onAccountBalance // Use the virtual property
      },
      message: 'On-account payment approved successfully'
    });

  } catch (error) {
    console.error('Error approving on-account payment:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Error approving on-account payment'
    });
  }
};

// Helper function to find credit for allocation


exports.addTransaction = async (req, res) => {
  try {
    const { brokerId, branchId } = req.params;
    const { 
      type, 
      amount, 
      modeOfPayment, 
      subPaymentMode,
      referenceNumber,
      bookingId, 
      bankId, 
      cashLocation: locationId,
      remark,
      adjustAgainstBookings
    } = req.body;
    const userId = req.user.id;

    // Validate required fields
    if (!type || !amount || !modeOfPayment) {
      return res.status(400).json({
        success: false,
        message: 'Type, amount, and modeOfPayment are required fields'
      });
    }

    // Validate subPaymentMode for Bank payments
    if (modeOfPayment === 'Bank' && !subPaymentMode) {
      return res.status(400).json({
        success: false,
        message: 'Sub-payment mode is required for bank payments'
      });
    }

    // Validate subPaymentMode exists if provided
    if (subPaymentMode) {
      const subPaymentModeExists = await BankSubPaymentMode.findById(subPaymentMode);
      if (!subPaymentModeExists) {
        return res.status(400).json({
          success: false,
          message: 'Invalid sub-payment mode selected'
        });
      }
    }

    // Check if broker exists
    const broker = await Broker.findById(brokerId);
    if (!broker) {
      return res.status(404).json({
        success: false,
        message: 'Broker not found'
      });
    }

    // Check if broker is associated with the branch
    const isBrokerInBranch = broker.branches.some(
      branch => branch.branch.toString() === branchId && branch.isActive
    );
    
    if (!isBrokerInBranch) {
      return res.status(400).json({
        success: false,
        message: 'Broker is not associated with this branch'
      });
    }

    // Find or create ledger
    let ledger = await BrokerLedger.findOne({ broker: brokerId, branch: branchId });
    if (!ledger) {
      ledger = await this.initializeLedger(brokerId, branchId, userId);
    }

    // Calculate on-account balance
    const onAccountBalance = ledger.onAccount || 0;

    // Handle adjustment logic
    let adjustedBookings = [];
    let remainingAmount = parseFloat(amount);
    let isOnAccount = false;

    if (type === 'CREDIT') {
      if (adjustAgainstBookings && adjustAgainstBookings.length > 0) {
        // Manual adjustment against specific bookings
        for (const adjustment of adjustAgainstBookings) {
          const booking = await Booking.findById(adjustment.bookingId);
          if (!booking) {
            return res.status(404).json({
              success: false,
              message: `Booking ${adjustment.bookingId} not found`
            });
          }

          // Find the debit transactions for this booking
          const bookingDebits = ledger.transactions.filter(t => 
            t.booking && t.booking.toString() === adjustment.bookingId && t.type === 'DEBIT'
          );

          const totalDebit = bookingDebits.reduce((sum, t) => sum + t.amount, 0);
          const alreadyAdjusted = ledger.transactions
            .filter(t => t.type === 'CREDIT' && t.adjustedAgainst)
            .reduce((sum, t) => {
              const adjustmentsForThisBooking = t.adjustedAgainst.filter(a => 
                a.booking && a.booking.toString() === adjustment.bookingId
              );
              return sum + adjustmentsForThisBooking.reduce((s, a) => s + a.amount, 0);
            }, 0);

          const outstanding = totalDebit - alreadyAdjusted;

          if (adjustment.amount > outstanding) {
            return res.status(400).json({
              success: false,
              message: `Adjustment amount (${adjustment.amount}) exceeds outstanding balance (${outstanding}) for booking ${booking.bookingNumber}`
            });
          }

          if (adjustment.amount > remainingAmount) {
            return res.status(400).json({
              success: false,
              message: `Adjustment amount (${adjustment.amount}) exceeds remaining credit amount (${remainingAmount})`
            });
          }

          adjustedBookings.push({
            booking: adjustment.bookingId,
            amount: adjustment.amount
          });

          remainingAmount -= adjustment.amount;
        }
      } else if (!referenceNumber) {
        // No reference number and no specific adjustments = on-account payment
        isOnAccount = true;
      }
    }

    // Determine approval status
     let approvalStatus;
    if (type === 'DEBIT') {
      approvalStatus = 'Approved'; // Debits are auto-approved
    } else {
      approvalStatus = modeOfPayment === 'Cash' ? 'Approved' : 'Pending';
    }

    // Create transaction
   const transaction = {
      type,
      amount: parseFloat(amount),
      modeOfPayment,
      subPaymentMode: modeOfPayment === 'Bank' ? subPaymentMode : undefined,
      referenceNumber,
      remark,
      branch: branchId,
      createdBy: userId,
      booking: bookingId || null,
      bank: modeOfPayment === 'Bank' ? bankId : null,
      cashLocation: modeOfPayment === 'Cash' ? locationId : null,
      isOnAccount,
      adjustedAgainst: adjustedBookings,
      date: new Date(),
      approvalStatus,
      // Auto-approve if debit or cash, otherwise set to pending
      ...((type === 'DEBIT' || modeOfPayment === 'Cash') && {
        approvedBy: userId,
        approvedAt: new Date()
      })
    };
    // Add transaction to ledger
     // Add transaction to ledger
    ledger.transactions.push(transaction);
    
    // Update balance if transaction is approved
    if (approvalStatus === 'Approved') {
      if (type === 'CREDIT') {
        ledger.currentBalance -= parseFloat(amount);
        if (isOnAccount) {
          ledger.onAccount = (ledger.onAccount || 0) + parseFloat(amount);
          
          // Auto-allocation removed - only manual allocation through API is allowed
        }
      } else {
        // This is a DEBIT transaction (auto-approved)
        ledger.currentBalance += parseFloat(amount);
        
        // Auto-allocation removed - only manual allocation through API is allowed
      }
    }
    
    await ledger.save();
    // Populate the response with subPaymentMode
    const populatedLedger = await BrokerLedger.findById(ledger._id)
      .populate('broker', 'name mobile')
      .populate('branch', 'name')
      .populate({
        path: 'transactions.booking',
        select: 'bookingNumber customerDetails chassisNumber',
        transform: (doc) => {
          if (!doc) return null;
          return {
            bookingNumber: doc.bookingNumber,
            customerName: doc.customerDetails ? 
              `${doc.customerDetails.salutation || ''} ${doc.customerDetails.name || ''}`.trim() : 
              'N/A',
            chassisNumber: doc.chassisNumber
          };
        }
      })
      .populate('transactions.bank', 'name')
      .populate('transactions.cashLocation', 'name')
      .populate('transactions.subPaymentMode', 'payment_mode')
      .populate('transactions.createdBy', 'name')
      .populate('transactions.adjustedAgainst.booking', 'bookingNumber');

    res.status(201).json({
      success: true,
      data: populatedLedger,
      onAccountBalance: populatedLedger.onAccount || 0,
      message: approvalStatus === 'Approved' 
        ? 'Transaction added successfully' 
        : 'Transaction submitted for approval'
    });

  } catch (error) {
    console.error('Error adding transaction:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Error adding transaction'
    });
  }
};

exports.getPendingTransactions = async (req, res) => {
  try {
    const { brokerId, branchId } = req.params;
    const { page = 1, limit = 20 } = req.query;
    const skip = (page - 1) * limit;

    // Find the ledger
    const ledger = await BrokerLedger.findOne({ broker: brokerId, branch: branchId })
      .populate('broker', 'name mobile email')
      .populate('branch', 'name code')
      .populate({
        path: 'transactions',
        match: { approvalStatus: 'Pending' },
        options: { 
          sort: { date: -1 },
          skip: skip,
          limit: parseInt(limit)
        },
        populate: [
          { 
            path: 'booking',
            select: 'bookingNumber customerDetails chassisNumber',
            transform: (doc) => {
              if (!doc) return null;
              return {
                bookingNumber: doc.bookingNumber,
                customerName: doc.customerDetails ? 
                  `${doc.customerDetails.salutation || ''} ${doc.customerDetails.name || ''}`.trim() : 
                  'N/A',
                chassisNumber: doc.chassisNumber
              };
            }
          },
          { path: 'bank', select: 'name' },
          { path: 'cashLocation', select: 'name' },
          { path: 'subPaymentMode', select: 'payment_mode' },
          { path: 'createdBy', select: 'name' }
        ]
      });

    if (!ledger) {
      return res.status(404).json({
        success: false,
        message: 'Ledger not found for this broker and branch'
      });
    }

    // Get total count of pending transactions
    const totalCount = await BrokerLedger.aggregate([
      { $match: { broker: new mongoose.Types.ObjectId(brokerId), branch: new mongoose.Types.ObjectId(branchId) } },
      { $unwind: '$transactions' },
      { $match: { 'transactions.approvalStatus': 'Pending' } },
      { $count: 'total' }
    ]);

    const total = totalCount.length > 0 ? totalCount[0].total : 0;

    res.status(200).json({
      success: true,
      data: {
        broker: ledger.broker,
        branch: ledger.branch,
        pendingTransactions: ledger.transactions || [],
        pagination: {
          current: parseInt(page),
          total: Math.ceil(total / limit),
          count: ledger.transactions ? ledger.transactions.length : 0,
          totalRecords: total
        }
      }
    });

  } catch (error) {
    console.error('Error fetching pending transactions:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Error fetching pending transactions'
    });
  }
};
// Approve broker ledger transaction
exports.approveBrokerTransaction = async (req, res) => {
  try {
    const { brokerId, branchId, transactionId } = req.params;
    const { remark } = req.body;
    const userId = req.user.id;

    // Find the ledger
    const ledger = await BrokerLedger.findOne({
      broker: brokerId,
      branch: branchId
    });

    if (!ledger) {
      return res.status(404).json({
        success: false,
        message: 'Broker ledger not found'
      });
    }

    // Find the transaction
    const transaction = ledger.transactions.id(transactionId);
    if (!transaction) {
      return res.status(404).json({
        success: false,
        message: 'Transaction not found'
      });
    }

    // Check if transaction is pending approval
    if (transaction.approvalStatus !== 'Pending') {
      return res.status(400).json({
        success: false,
        message: 'Transaction is not pending approval'
      });
    }

    // Update transaction status
   transaction.approvalStatus = 'Approved';
    transaction.approvedBy = userId;
    transaction.approvedAt = new Date();
    
    if (remark) {
      transaction.remark = transaction.remark 
        ? `${transaction.remark} | Approval: ${remark}`
        : `Approval: ${remark}`;
    }

    // Update balance when approved
    if (transaction.type === 'CREDIT') {
      ledger.currentBalance -= transaction.amount;
      if (transaction.isOnAccount) {
        ledger.onAccount = (ledger.onAccount || 0) + transaction.amount;
        
        // Auto-allocation removed - only manual allocation through API is allowed
      }
    } else {
      ledger.currentBalance += transaction.amount;
      
      // Auto-allocation removed - only manual allocation through API is allowed
    }

    await ledger.save();

    // Populate the response
    const populatedLedger = await BrokerLedger.findById(ledger._id)
      .populate('broker', 'name mobile')
      .populate('branch', 'name')
      .populate({
        path: 'transactions.booking',
        select: 'bookingNumber customerDetails chassisNumber',
        transform: (doc) => {
          if (!doc) return null;
          return {
            bookingNumber: doc.bookingNumber,
            customerName: doc.customerDetails ? 
              `${doc.customerDetails.salutation || ''} ${doc.customerDetails.name || ''}`.trim() : 
              'N/A',
            chassisNumber: doc.chassisNumber
          };
        }
      })
      .populate('transactions.bank', 'name')
      .populate('transactions.cashLocation', 'name')
      .populate('transactions.subPaymentMode', 'payment_mode')
      .populate('transactions.createdBy', 'name')
      .populate('transactions.approvedBy', 'name')
      .populate('transactions.adjustedAgainst.booking', 'bookingNumber');

    const approvedTransaction = populatedLedger.transactions.id(transactionId);

    res.status(200).json({
      success: true,
      data: {
        transaction: approvedTransaction,
        currentBalance: populatedLedger.currentBalance,
        onAccount: populatedLedger.onAccount || 0
      },
      message: 'Transaction approved successfully'
    });

  } catch (error) {
    console.error('Error approving broker transaction:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Error approving transaction'
    });
  }
};
// Get ledger for a broker in a specific branch
exports.getLedger = async (req, res) => {
  try {
    const { brokerId, branchId } = req.params;
    const { page = 1, limit = 20, fromDate, toDate } = req.query;
    
    const ledger = await BrokerLedger.findOne({ broker: brokerId, branch: branchId })
      .populate('broker', 'name mobile email')
      .populate('branch', 'name')
      .populate({
        path: 'transactions.booking',
        select: 'bookingNumber customerDetails chassisNumber'
      })
      .populate('transactions.bank', 'name')
      .populate('transactions.cashLocation', 'name')
      .populate('transactions.subPaymentMode', 'payment_mode')
      .populate('transactions.createdBy', 'name');

    if (!ledger) {
      return res.status(404).json({
        success: false,
        message: 'Ledger not found for this broker and branch'
      });
    }

    res.status(200).json({
      success: true,
      data: ledger
    });
  } catch (error) {
    console.error('Error fetching ledger:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Error fetching ledger'
    });
  }
};
exports.addOnAccountPayment = async (req, res) => {
  try {
    const { brokerId, branchId } = req.params;
    const { 
      amount, 
      modeOfPayment, 
      subPaymentMode,
      referenceNumber, 
      bankId, 
      cashLocation, 
      remark 
    } = req.body;
    const userId = req.user.id;

    // Validate required fields
    if (!amount || !modeOfPayment) {
      return res.status(400).json({
        success: false,
        message: 'Amount and modeOfPayment are required fields'
      });
    }

    // Validate subPaymentMode for Bank payments
    if (modeOfPayment === 'Bank' && !subPaymentMode) {
      return res.status(400).json({
        success: false,
        message: 'Sub-payment mode is required for bank payments'
      });
    }

    // Validate subPaymentMode exists if provided
    if (subPaymentMode) {
      const subPaymentModeExists = await BankSubPaymentMode.findById(subPaymentMode);
      if (!subPaymentModeExists) {
        return res.status(400).json({
          success: false,
          message: 'Invalid sub-payment mode selected'
        });
      }
    }

    // Check if broker exists and is associated with branch
    const broker = await Broker.findById(brokerId);
    if (!broker) {
      return res.status(404).json({
        success: false,
        message: 'Broker not found'
      });
    }

    const isBrokerInBranch = broker.branches.some(
      branch => branch.branch.toString() === branchId && branch.isActive
    );
    
    if (!isBrokerInBranch) {
      return res.status(400).json({
        success: false,
        message: 'Broker is not associated with this branch'
      });
    }

    // Check for duplicate reference number
    const existingRef = await BrokerLedger.findOne({
      broker: brokerId,
      branch: branchId,
      'transactions.referenceNumber': referenceNumber
    });

    if (existingRef && referenceNumber) {
      return res.status(400).json({
        success: false,
        message: 'Reference number already exists for this broker and branch'
      });
    }

    // Create transaction
    const transaction = {
      type: 'CREDIT',
      amount: parseFloat(amount),
      modeOfPayment,
      subPaymentMode: modeOfPayment === 'Bank' ? subPaymentMode : undefined,
      referenceNumber: referenceNumber || `REF-${Date.now()}`,
      remark: remark || 'On-account payment',
      branch: branchId,
      createdBy: userId,
      booking: null,
      bank: modeOfPayment === 'Bank' ? bankId : null,
      cashLocation: modeOfPayment === 'Cash' ? cashLocation : null,
      isOnAccount: true,
      adjustedAgainst: [],
      date: new Date(),
      approvalStatus: modeOfPayment === 'Cash' ? 'Approved' : 'Pending',
      ...(modeOfPayment === 'Cash' && {
        approvedBy: userId,
        approvedAt: new Date()
      })
    };

    // Use findOneAndUpdate with upsert to handle existing or new ledger
    const ledger = await BrokerLedger.findOneAndUpdate(
      { broker: brokerId, branch: branchId },
      {
        $push: { transactions: transaction },
        $inc: { 
          currentBalance: -parseFloat(amount),
          onAccount: parseFloat(amount)
        },
        $setOnInsert: {
          createdBy: userId,
          lastUpdatedBy: userId
        }
      },
      { 
        new: true,
        upsert: true,
        setDefaultsOnInsert: true 
      }
    )
    .populate('broker', 'name mobile')
    .populate('branch', 'name')
    .populate('transactions.bank', 'name')
    .populate('transactions.cashLocation', 'name')
    .populate('transactions.subPaymentMode', 'payment_mode')
    .populate('transactions.createdBy', 'name');

    // Auto-allocation removed - only manual allocation through API is allowed

    res.status(201).json({
      success: true,
      data: ledger,
      onAccountBalance: ledger.onAccount,
      message: 'On-account payment added successfully'
    });

  } catch (error) {
    console.error('Error adding on-account payment:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Error adding on-account payment'
    });
  }
};
const isObjectId = (v) => mongoose.isValidObjectId(v);

function sum(arr, fn = (x) => x) {
  return (arr || []).reduce((s, x) => s + Number(fn(x) || 0), 0);
}

function remainingForCreditTx(tx) {
  if (!tx || tx.type !== 'CREDIT') return 0;
  const allocated = sum(tx.allocations, (a) => a.amount);
  return Math.max(0, Number(tx.amount || 0) - allocated);
}

function buildPendingMap(ledger) {
  const debitByBooking = new Map();
  const allocatedByBooking = new Map();

  for (const tx of ledger.transactions || []) {
    if (tx.type === 'DEBIT' && tx.booking) {
      const k = String(tx.booking);
      debitByBooking.set(k, (debitByBooking.get(k) || 0) + Number(tx.amount || 0));
    }
    if (tx.type === 'CREDIT' && Array.isArray(tx.allocations)) {
      for (const a of tx.allocations) {
        if (!a?.booking) continue;
        const k = String(a.booking);
        allocatedByBooking.set(k, (allocatedByBooking.get(k) || 0) + Number(a.amount || 0));
      }
    }
  }

  const pending = new Map();
  for (const [k, dsum] of debitByBooking.entries()) {
    const as = allocatedByBooking.get(k) || 0;
    const bal = +(Number(dsum) - Number(as)).toFixed(2);
    if (bal > 0.001) pending.set(k, bal);
  }
  return pending;
}

exports.depositOnAccount = async (req, res) => {
  try {
    const { brokerId, branchId } = req.params;
    if (!isObjectId(brokerId) || !isObjectId(branchId)) {
      return res.status(400).json({ success: false, message: 'Invalid broker or branch id' });
    }

    const { amount, modeOfPayment, subPaymentMode, referenceNumber, bankId, remark, date } = req.body || {};
    const amt = Number(amount || 0);
    if (!(amt > 0)) return res.status(400).json({ success: false, message: 'amount must be > 0' });
    if (!referenceNumber || !String(referenceNumber).trim()) {
      return res.status(400).json({ success: false, message: 'referenceNumber is required' });
    }

    // Validate subPaymentMode for Bank payments
    if (modeOfPayment === 'Bank' && !subPaymentMode) {
      return res.status(400).json({
        success: false,
        message: 'Sub-payment mode is required for bank payments'
      });
    }

    // Validate subPaymentMode exists if provided
    if (subPaymentMode) {
      const subPaymentModeExists = await BankSubPaymentMode.findById(subPaymentMode);
      if (!subPaymentModeExists) {
        return res.status(400).json({
          success: false,
          message: 'Invalid sub-payment mode selected'
        });
      }
    }

    // Check if broker is associated with the branch
    const broker = await Broker.findById(brokerId);
    if (!broker) {
      return res.status(404).json({ success: false, message: 'Broker not found' });
    }
    
    const isBrokerInBranch = broker.branches.some(
      branch => branch.branch.toString() === branchId && branch.isActive
    );
    
    if (!isBrokerInBranch) {
      return res.status(400).json({
        success: false,
        message: 'Broker is not associated with this branch'
      });
    }

    // Enforce unique referenceNumber per broker per branch
    const dup = await BrokerLedger.findOne({ 
      broker: brokerId, 
      branch: branchId,
      'transactions.referenceNumber': referenceNumber 
    }, { _id: 1 }).lean();
    
    if (dup) return res.status(409).json({ 
      success: false, 
      message: 'referenceNumber already exists for this broker and branch' 
    });
 const creditTx = {
      type: 'CREDIT',
      amount: amt,
      modeOfPayment: modeOfPayment || 'Bank',
      subPaymentMode: modeOfPayment === 'Bank' ? subPaymentMode : undefined,
      referenceNumber: referenceNumber.trim(),
      bank: bankId || null,
      branch: branchId,
      remark: remark || '',
      isOnAccount: true,
      allocations: [],
      date: date ? new Date(date) : new Date(),
      createdBy: req.user?.id,
      approvalStatus: modeOfPayment === 'Cash' ? 'Approved' : 'Pending',
      ...(modeOfPayment === 'Cash' && {
        approvedBy: req.user?.id,
        approvedAt: new Date()
      })
    };

    // Check if ledger exists
    const existingLedger = await BrokerLedger.findOne({ broker: brokerId, branch: branchId });
    
    let ledger;
    if (existingLedger) {
      // Update existing ledger
      ledger = await BrokerLedger.findOneAndUpdate(
        { broker: brokerId, branch: branchId },
        {
          $push: { transactions: creditTx },
          $inc: { 
            onAccount: amt,
            currentBalance: -amt
          }
        },
        { new: true }
      )
      .populate('broker', 'name mobile')
      .populate('branch', 'name')
      .lean();
    } else {
      // Create new ledger
      ledger = await BrokerLedger.create({
        broker: brokerId,
        branch: branchId,
        onAccount: amt,
        currentBalance: -amt,
        transactions: [creditTx],
        createdBy: req.user?.id
      });
      
      // Populate broker and branch info
      ledger = await BrokerLedger.findById(ledger._id)
        .populate('broker', 'name mobile')
        .populate('branch', 'name')
        .lean();
    }

    // Auto-allocation removed - only manual allocation through API is allowed
    

    return res.status(201).json({
      success: true,
      data: {
        broker: ledger.broker,
        branch: ledger.branch,
        onAccount: ledger.onAccount,
        reference: {
          referenceNumber: creditTx.referenceNumber,
          amount: creditTx.amount,
          modeOfPayment: creditTx.modeOfPayment,
          bankId: creditTx.bank,
          remark: creditTx.remark,
          remaining: creditTx.amount
        }
      }
    });
  } catch (err) {
    console.error('depositOnAccount error:', err);
    return res.status(500).json({ success: false, message: 'Internal error' });
  }
};

// Manual allocation removed - only auto-allocation is allowed

exports.getOnAccountSummary = async (req, res) => {
  try {
    const { brokerId, branchId } = req.params;
    if (!isObjectId(brokerId) || !isObjectId(branchId)) {
      return res.status(400).json({ success: false, message: 'Invalid broker or branch id' });
    }

    const ledger = await BrokerLedger.findOne({ broker: brokerId, branch: branchId }).lean();
    if (!ledger) {
      return res.json({ success: true, data: { onAccount: 0, references: [] } });
    }

    const references = [];
    for (const tx of ledger.transactions || []) {
      // Only include approved CREDIT transactions with reference numbers
      if (tx.type === 'CREDIT' && tx.referenceNumber && tx.approvalStatus === 'Approved') {
        const allocated = sum(tx.allocations, (a) => a.amount);
        const remaining = remainingForCreditTx(tx);
        references.push({
          referenceNumber: tx.referenceNumber,
          amount: Number(tx.amount || 0),
          allocated,
          remaining,
          modeOfPayment: tx.modeOfPayment || '',
          bankId: tx.bankId || '',
          remark: tx.remark || '',
          date: tx.date,
          isOnAccount: tx.isOnAccount || false
        });
      }
    }
    // newest first
    references.sort((a, b) => new Date(b.date) - new Date(a.date));

    return res.json({
      success: true,
      data: {
        onAccount: ledger.onAccount || 0,
        onAccountBalance: ledger.onAccountBalance || 0, // Use the virtual property
        references
      }
    });
  } catch (err) {
    console.error('getOnAccountSummary error:', err);
    return res.status(500).json({ success: false, message: 'Internal error' });
  }
};

exports.getPendingDebits = async (req, res) => {
  try {
    const { brokerId, branchId } = req.params;

    const ledger = await BrokerLedger.findOne({ broker: brokerId, branch: branchId })
      .populate('transactions.booking', 'bookingNumber customerDetails chassisNumber exchangeDetails');

    if (!ledger) {
      return res.status(404).json({
        success: false,
        message: 'Ledger not found for this broker and branch'
      });
    }

    // Calculate outstanding amounts per booking
    const bookingOutstanding = {};
    
    ledger.transactions.forEach(txn => {
      if (txn.booking && txn.type === 'DEBIT') {
        const bookingId = txn.booking._id.toString();
        if (!bookingOutstanding[bookingId]) {
          bookingOutstanding[bookingId] = {
            booking: txn.booking,
            totalDebit: 0,
            totalAdjusted: 0
          };
        }
        bookingOutstanding[bookingId].totalDebit += txn.amount;
      }

      if (txn.type === 'CREDIT' && txn.adjustedAgainst) {
        txn.adjustedAgainst.forEach(adjustment => {
          if (adjustment.booking) {
            const bookingId = adjustment.booking.toString();
            if (!bookingOutstanding[bookingId]) {
              bookingOutstanding[bookingId] = {
                booking: null,
                totalDebit: 0,
                totalAdjusted: 0
              };
            }
            bookingOutstanding[bookingId].totalAdjusted += adjustment.amount;
          }
        });
      }
    });

    // Format response
    const pendingDebits = Object.values(bookingOutstanding)
      .filter(item => item.totalDebit > item.totalAdjusted)
      .map(item => ({
        booking: item.booking,
        outstandingAmount: item.totalDebit - item.totalAdjusted
      }));

    // Get on-account balance
    const onAccountBalance = ledger.onAccount || 0;

    res.status(200).json({
      success: true,
      data: {
        pendingDebits,
        onAccountBalance
      }
    });

  } catch (error) {
    console.error('Error fetching pending debits:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Error fetching pending debits'
    });
  }
};


exports.getStatement = async (req, res) => {
  try {
    const { brokerId } = req.params;
    const { fromDate, toDate } = req.query;

    if (!mongoose.isValidObjectId(brokerId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid broker ID'
      });
    }
    
    const ledgers = await BrokerLedger.find({ broker: brokerId })
      .populate('broker', 'name brokerId phone email address')
      .populate('branch', 'name code address city')
      .populate({
        path: 'transactions',
        match: {
          date: {
            $gte: new Date(fromDate || '1970-01-01'),
            $lte: new Date(toDate || Date.now())
          },
          approvalStatus: 'Approved'
        },
        options: { sort: { date: 1 } },
        populate: [
          { 
            path: 'booking',
            select: 'bookingNumber customerDetails chassisNumber model color branch exchange exchangeDetails payment accessoriesTotal totalAmount discountedAmount receivedAmount balanceAmount bookingType status createdAt createdBy',
            populate: [
              {
                path: 'model',
                select: 'model_name vehicle_type'
              },
              {
                path: 'color',
                select: 'name code'
              },
              {
                path: 'branch',
                select: 'name code'
              },
              {
                path: 'createdBy',
                select: 'name email'
              },
              // FIX: Properly populate exchangeDetails.broker
              {
                path: 'exchangeDetails.broker',
                select: 'name brokerId phone'
              }
            ]
          },
          { path: 'bank', select: 'name accountNumber ifsc branchName' },
          { path: 'cashLocation', select: 'name location' },
          { path: 'createdBy', select: 'name email username' },
          { path: 'approvedBy', select: 'name email' },
          {
            path: 'allocations.booking',
            select: 'bookingNumber customerDetails chassisNumber model color exchange exchangeDetails',
            populate: [
              {
                path: 'model',
                select: 'model_name'
              },
              {
                path: 'color',
                select: 'name'
              },
              // FIX: Properly populate exchangeDetails.broker for allocations
              {
                path: 'exchangeDetails.broker',
                select: 'name brokerId'
              }
            ]
          }
        ]
      });

    if (!ledgers || ledgers.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No ledgers found for this broker'
      });
    }

    // Combine transactions from all branches and sort by date
    let allTransactions = [];
    ledgers.forEach(ledger => {
      if (ledger.transactions && ledger.transactions.length > 0) {
        const approvedTransactions = ledger.transactions.filter(txn => 
          txn.approvalStatus === 'Approved'
        );
        
        approvedTransactions.forEach(txn => {
          // Enhanced transaction object with branch info
          allTransactions.push({
            ...(txn.toObject ? txn.toObject() : txn),
            branchName: ledger.branch?.name || 'Unknown Branch',
            branchCode: ledger.branch?.code || '',
            branchDetails: ledger.branch || null
          });
        });
      }
    });

    // Sort all transactions by date
    allTransactions.sort((a, b) => new Date(a.date) - new Date(b.date));

    // Calculate running balance and separate on-account payments
    let runningBalance = 0;
    let onAccountBalance = 0;
    const statement = [];
    const onAccountPayments = [];

    allTransactions.forEach(txn => {
      // ENHANCED: Extract exchange details directly from booking
      let exchangeDisplay = {
        isExchange: false,
        vehicleNumber: null,
        chassisNumber: null,
        price: null,
        brokerName: null,
        status: null
      };

      if (txn.booking && txn.booking.exchange === true && txn.booking.exchangeDetails) {
        exchangeDisplay = {
          isExchange: true,
          vehicleNumber: txn.booking.exchangeDetails.vehicleNumber || 'N/A',
          chassisNumber: txn.booking.exchangeDetails.chassisNumber || 'N/A',
          price: txn.booking.exchangeDetails.price || 0,
          brokerName: txn.booking.exchangeDetails.broker ? 
            txn.booking.exchangeDetails.broker.name : 'N/A',
          status: txn.booking.exchangeDetails.status || 'PENDING'
        };
      }

      // Enhanced booking details extraction with explicit exchange info
      const bookingDetails = txn.booking ? {
        id: txn.booking._id,
        bookingNumber: txn.booking.bookingNumber || 'N/A',
        bookingType: txn.booking.bookingType || 'N/A',
        status: txn.booking.status || 'N/A',
        createdAt: txn.booking.createdAt,
        createdAtFormatted: txn.booking.createdAt ? new Date(txn.booking.createdAt).toLocaleDateString('en-GB') : null,
        
        // Customer details
        customer: txn.booking.customerDetails ? {
          name: txn.booking.customerDetails.name || 'N/A',
          fullName: txn.booking.customerDetails.salutation ? 
            `${txn.booking.customerDetails.salutation} ${txn.booking.customerDetails.name || ''}`.trim() : 
            txn.booking.customerDetails.name || 'N/A',
          mobile: txn.booking.customerDetails.mobile1 || 'N/A',
          aadharNumber: txn.booking.customerDetails.aadharNumber || 'N/A',
          panNo: txn.booking.customerDetails.panNo || 'N/A',
          address: txn.booking.customerDetails.address || 'N/A',
          custId: txn.booking.customerDetails.custId || 'N/A'
        } : null,
        
        // Vehicle details
        vehicle: {
          chassisNumber: txn.booking.chassisNumber || 'N/A',
          model: txn.booking.model ? {
            id: txn.booking.model._id,
            name: txn.booking.model.model_name || 'N/A',
            vehicleType: txn.booking.model.vehicle_type || 'N/A'
          } : null,
          modelName: txn.booking.model?.model_name || 'N/A',
          color: txn.booking.color ? {
            id: txn.booking.color._id,
            name: txn.booking.color.name || 'N/A',
            code: txn.booking.color.code || 'N/A'
          } : null,
          colorName: txn.booking.color?.name || 'N/A'
        },
        
        // EXCHANGE VEHICLE DETAILS - ENHANCED with direct access
        exchange: {
          isExchange: txn.booking.exchange || false,
          details: txn.booking.exchangeDetails ? {
            vehicleNumber: txn.booking.exchangeDetails.vehicleNumber || 'N/A',
            chassisNumber: txn.booking.exchangeDetails.chassisNumber || 'N/A',
            price: txn.booking.exchangeDetails.price || 0,
            broker: txn.booking.exchangeDetails.broker ? {
              id: txn.booking.exchangeDetails.broker._id,
              name: txn.booking.exchangeDetails.broker.name || 'N/A',
              brokerId: txn.booking.exchangeDetails.broker.brokerId || 'N/A',
              phone: txn.booking.exchangeDetails.broker.phone || 'N/A'
            } : null,
            brokerName: txn.booking.exchangeDetails.broker?.name || 'N/A',
            status: txn.booking.exchangeDetails.status || 'PENDING',
            otpVerified: txn.booking.exchangeDetails.otpVerified || false,
            completedAt: txn.booking.exchangeDetails.completedAt,
            completedAtFormatted: txn.booking.exchangeDetails.completedAt ? 
              new Date(txn.booking.exchangeDetails.completedAt).toLocaleString('en-GB') : null
          } : null,
          // SIMPLE DISPLAY FORMAT - exactly as requested
          display: exchangeDisplay
        },
        
        // Financial details
        financials: {
          totalAmount: txn.booking.totalAmount || 0,
          discountedAmount: txn.booking.discountedAmount || 0,
          accessoriesTotal: txn.booking.accessoriesTotal || 0,
          receivedAmount: txn.booking.receivedAmount || 0,
          balanceAmount: txn.booking.balanceAmount || 0,
          paymentType: txn.booking.payment?.type || 'N/A',
          financer: txn.booking.payment?.financer || null
        },
        
        // Branch details
        branch: txn.booking.branch ? {
          id: txn.booking.branch._id,
          name: txn.booking.branch.name || 'N/A',
          code: txn.booking.branch.code || 'N/A'
        } : null,
        
        // Created by
        createdBy: txn.booking.createdBy ? {
          id: txn.booking.createdBy._id,
          name: txn.booking.createdBy.name || 'N/A',
          email: txn.booking.createdBy.email || 'N/A'
        } : null
      } : null;

      if (txn.type === 'CREDIT') {
        runningBalance -= txn.amount;
        
        // If it's a payment (not associated with a booking), it's an on-account payment
        if (!txn.booking && txn.isOnAccount) {
          onAccountBalance += txn.amount;
          onAccountPayments.push({
            id: txn._id,
            date: txn.date,
            dateFormatted: txn.date ? new Date(txn.date).toLocaleString('en-GB') : null,
            type: txn.type,
            amount: txn.amount,
            mode: txn.modeOfPayment,
            referenceNumber: txn.referenceNumber,
            receiptNumber: txn.receiptNumber,
            branch: txn.branchName,
            branchCode: txn.branchCode,
            branchDetails: txn.branchDetails,
            bank: txn.bank ? {
              id: txn.bank._id,
              name: txn.bank.name,
              accountNumber: txn.bank.accountNumber ? `XXXX${txn.bank.accountNumber.slice(-4)}` : 'XXXX',
              ifsc: txn.bank.ifsc
            } : null,
            cashLocation: txn.cashLocation ? {
              id: txn.cashLocation._id,
              name: txn.cashLocation.name,
              location: txn.cashLocation.location
            } : null,
            remark: txn.remark || 'On Account Payment',
            createdBy: txn.createdBy ? {
              id: txn.createdBy._id,
              name: txn.createdBy.name,
              email: txn.createdBy.email
            } : null,
            createdByName: txn.createdBy?.name || 'System',
            approvalStatus: txn.approvalStatus,
            approvedBy: txn.approvedBy ? {
              id: txn.approvedBy._id,
              name: txn.approvedBy.name
            } : null,
            isOnAccount: true
          });
        }
      } else {
        runningBalance += txn.amount;
      }

      // Add to statement only if it's not an on-account payment
      if (txn.booking || txn.type === 'DEBIT') {
        // Check if this is an exchange-related transaction
        const isExchangeTransaction = txn.type === 'DEBIT' && 
                                     txn.modeOfPayment === 'Exchange' && 
                                     bookingDetails?.exchange?.isExchange;
        
        // ENHANCED: Get exchange details in the requested format
        let exchangeDisplay = {
          Exchange: bookingDetails?.exchange?.isExchange ? 'Yes' : 'No',
          VehicleNumber: bookingDetails?.exchange?.details?.vehicleNumber || 'N/A',
          ChassisNumber: bookingDetails?.exchange?.details?.chassisNumber || 'N/A',
          Price: bookingDetails?.exchange?.details?.price ? 
            `₹${bookingDetails.exchange.details.price.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : 'N/A',
          Broker: bookingDetails?.exchange?.details?.brokerName || 'N/A'
        };

        statement.push({
          id: txn._id,
          date: txn.date,
          dateFormatted: txn.date ? new Date(txn.date).toLocaleString('en-GB') : null,
          type: txn.type,
          amount: txn.amount,
          mode: txn.modeOfPayment,
          referenceNumber: txn.referenceNumber,
          receiptNumber: txn.receiptNumber,
          branch: txn.branchName,
          branchCode: txn.branchCode,
          branchDetails: txn.branchDetails,
          
          // ENHANCED BOOKING DETAILS WITH EXCHANGE INFO
          booking: bookingDetails,
          
          // EXCHANGE VEHICLE DETAILS - SIMPLE DISPLAY FORMAT (as requested)
          exchangeDisplay: exchangeDisplay,
          
          // EXCHANGE VEHICLE DETAILS - DETAILED FORMAT
          exchangeVehicle: {
            Exchange: bookingDetails?.exchange?.isExchange ? 'Yes' : 'No',
            VehicleNumber: bookingDetails?.exchange?.details?.vehicleNumber || 'N/A',
            ChassisNumber: bookingDetails?.exchange?.details?.chassisNumber || 'N/A',
            Price: bookingDetails?.exchange?.details?.price || 0,
            PriceFormatted: bookingDetails?.exchange?.details?.price ? 
              `₹${bookingDetails.exchange.details.price.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : 'N/A',
            Broker: bookingDetails?.exchange?.details?.brokerName || 'N/A',
            Status: bookingDetails?.exchange?.details?.status || 'N/A'
          },
          
          // Payment details
          bank: txn.bank ? {
            id: txn.bank._id,
            name: txn.bank.name,
            accountNumber: txn.bank.accountNumber ? `XXXX${txn.bank.accountNumber.slice(-4)}` : 'XXXX',
            ifsc: txn.bank.ifsc,
            branchName: txn.bank.branchName
          } : null,
          
          cashLocation: txn.cashLocation ? {
            id: txn.cashLocation._id,
            name: txn.cashLocation.name,
            location: txn.cashLocation.location
          } : null,
          
          remark: txn.remark,
          balance: runningBalance,
          
          // Creator details
          createdBy: txn.createdBy ? {
            id: txn.createdBy._id,
            name: txn.createdBy.name,
            email: txn.createdBy.email,
            username: txn.createdBy.username
          } : null,
          createdByName: txn.createdBy?.name || 'System',
          
          // Approval details
          approvalStatus: txn.approvalStatus,
          approvedBy: txn.approvedBy ? {
            id: txn.approvedBy._id,
            name: txn.approvedBy.name
          } : null,
          
          isOnAccount: txn.isOnAccount || false,
          isExchange: isExchangeTransaction,
          
          // Allocation details
          allocations: txn.allocations?.map(alloc => {
            // ENHANCED: Check if allocated booking has exchange
            const allocExchangeDisplay = {
              Exchange: alloc.booking?.exchange ? 'Yes' : 'No',
              VehicleNumber: alloc.booking?.exchangeDetails?.vehicleNumber || 'N/A',
              ChassisNumber: alloc.booking?.exchangeDetails?.chassisNumber || 'N/A',
              Price: alloc.booking?.exchangeDetails?.price ? 
                `₹${alloc.booking.exchangeDetails.price.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : 'N/A',
              Broker: alloc.booking?.exchangeDetails?.broker?.name || 'N/A'
            };

            return {
              id: alloc._id,
              amount: alloc.amount,
              date: alloc.date,
              dateFormatted: alloc.date ? new Date(alloc.date).toLocaleString('en-GB') : null,
              allocationType: alloc.allocationType,
              receiptNumber: alloc.receiptNumber,
              booking: alloc.booking ? {
                id: alloc.booking._id,
                bookingNumber: alloc.booking.bookingNumber || 'N/A',
                customerName: alloc.booking.customerDetails ? 
                  `${alloc.booking.customerDetails.salutation || ''} ${alloc.booking.customerDetails.name || ''}`.trim() : 
                  'N/A',
                chassisNumber: alloc.booking.chassisNumber || 'N/A',
                model: alloc.booking.model?.model_name || 'N/A',
                color: alloc.booking.color?.name || 'N/A',
                // Exchange details for the allocated booking
                exchange: alloc.booking.exchange ? {
                  isExchange: true,
                  vehicleNumber: alloc.booking.exchangeDetails?.vehicleNumber,
                  chassisNumber: alloc.booking.exchangeDetails?.chassisNumber,
                  price: alloc.booking.exchangeDetails?.price,
                  brokerName: alloc.booking.exchangeDetails?.broker?.name
                } : { isExchange: false },
                exchangeDisplay: allocExchangeDisplay
              } : null
            };
          }) || []
        });
      }

      // Add allocation entries (keep existing allocation code)
      if (txn.allocations && txn.allocations.length > 0 && txn.type === 'CREDIT') {
        txn.allocations.forEach(alloc => {
          // Check if allocation is for an exchange booking
          const isExchangeAllocation = alloc.booking?.exchange === true;
          
          // ENHANCED: Exchange display for allocation
          const allocExchangeDisplay = {
            Exchange: alloc.booking?.exchange ? 'Yes' : 'No',
            VehicleNumber: alloc.booking?.exchangeDetails?.vehicleNumber || 'N/A',
            ChassisNumber: alloc.booking?.exchangeDetails?.chassisNumber || 'N/A',
            Price: alloc.booking?.exchangeDetails?.price ? 
              `₹${alloc.booking.exchangeDetails.price.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : 'N/A',
            Broker: alloc.booking?.exchangeDetails?.broker?.name || 'N/A'
          };
          
          statement.push({
            id: `${txn._id}_alloc_${alloc._id}`,
            date: alloc.date || txn.date,
            dateFormatted: alloc.date ? new Date(alloc.date).toLocaleString('en-GB') : 
                           (txn.date ? new Date(txn.date).toLocaleString('en-GB') : null),
            type: 'CREDIT',
            amount: alloc.amount,
            mode: 'Allocation',
            referenceNumber: `ALLOC-${txn.referenceNumber}`,
            receiptNumber: alloc.receiptNumber || `ALLOC-${txn.receiptNumber}` || `ALLOC-${txn.referenceNumber}`, 
            branch: txn.branchName,
            branchCode: txn.branchCode,
            branchDetails: txn.branchDetails,
            booking: alloc.booking ? {
              id: alloc.booking._id,
              bookingNumber: alloc.booking.bookingNumber || 'N/A',
              customer: alloc.booking.customerDetails ? {
                name: alloc.booking.customerDetails.name || 'N/A',
                fullName: alloc.booking.customerDetails.salutation ? 
                  `${alloc.booking.customerDetails.salutation} ${alloc.booking.customerDetails.name || ''}`.trim() : 
                  alloc.booking.customerDetails.name || 'N/A',
                mobile: alloc.booking.customerDetails.mobile1 || 'N/A'
              } : null,
              customerName: alloc.booking.customerDetails ? 
                `${alloc.booking.customerDetails.salutation || ''} ${alloc.booking.customerDetails.name || ''}`.trim() : 
                'N/A',
              chassisNumber: alloc.booking.chassisNumber || 'N/A',
              model: alloc.booking.model?.model_name || 'N/A',
              color: alloc.booking.color?.name || 'N/A',
              // Exchange details for the allocated booking
              exchange: alloc.booking.exchange ? {
                isExchange: true,
                vehicleNumber: alloc.booking.exchangeDetails?.vehicleNumber || 'N/A',
                chassisNumber: alloc.booking.exchangeDetails?.chassisNumber || 'N/A',
                price: alloc.booking.exchangeDetails?.price || 0,
                brokerName: alloc.booking.exchangeDetails?.broker?.name || 'N/A'
              } : { isExchange: false },
              exchangeDisplay: allocExchangeDisplay
            } : null,
            exchangeDisplay: allocExchangeDisplay,
            remark: `Allocation from ${txn.referenceNumber} - ${txn.remark || 'Broker payment'}`,
            balance: runningBalance,
            createdBy: txn.createdBy ? {
              id: txn.createdBy._id,
              name: txn.createdBy.name
            } : null,
            createdByName: txn.createdBy?.name || 'System',
            isOnAccount: false,
            approvalStatus: 'Approved',
            isAllocation: true,
            originalTransactionDate: txn.date,
            originalTransactionDateFormatted: txn.date ? new Date(txn.date).toLocaleString('en-GB') : null,
            allocationType: alloc.allocationType,
            // Flag if this allocation is for an exchange
            isExchangeAllocation: isExchangeAllocation
          });
        });
      }
    });

    // Sort statement by date
    statement.sort((a, b) => new Date(a.date) - new Date(b.date));

    // Calculate final running balance
    let finalBalance = 0;
    const finalStatement = statement.map(txn => {
      if (txn.type === 'CREDIT') {
        finalBalance -= txn.amount;
      } else {
        finalBalance += txn.amount;
      }
      return {
        ...txn,
        balance: finalBalance,
        balanceFormatted: `₹${finalBalance.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
      };
    });

    const uniqueBranches = [...new Set(ledgers.map(l => l.branch?.name).filter(Boolean))];

    const totalCredit = finalStatement.reduce((sum, t) => t.type === 'CREDIT' ? sum + t.amount : sum, 0);
    const totalDebit = finalStatement.reduce((sum, t) => t.type === 'DEBIT' ? sum + t.amount : sum, 0);
    const totalOnAccount = onAccountPayments.reduce((sum, p) => sum + p.amount, 0);

    const totalAllocated = finalStatement
      .filter(t => t.isAllocation)
      .reduce((sum, a) => sum + a.amount, 0);

    // Calculate exchange-related totals
    const exchangeTransactions = finalStatement.filter(t => t.isExchange === true);
    const totalExchangeAmount = exchangeTransactions.reduce((sum, t) => sum + t.amount, 0);
    
    const exchangeAllocations = finalStatement.filter(t => t.isExchangeAllocation === true);
    const totalExchangeAllocations = exchangeAllocations.reduce((sum, t) => sum + t.amount, 0);

    // ENHANCED: Collect all exchange vehicles
    const exchangeVehicles = finalStatement
      .filter(t => t.exchangeVehicle && t.exchangeVehicle.Exchange === 'Yes')
      .map(t => t.exchangeVehicle);

    const calculatedOnAccountBalance = ledgers.reduce((total, ledger) => {
      const ledgerOnAccount = ledger.transactions
        .filter(tx => 
          tx.type === 'CREDIT' && 
          tx.isOnAccount &&
          tx.approvalStatus === 'Approved' 
        )
        .reduce((sum, tx) => sum + tx.amount, 0);
      
      return total + ledgerOnAccount;
    }, 0);

    // Get broker details
    const brokerDetails = ledgers[0]?.broker ? {
      id: ledgers[0].broker._id,
      name: ledgers[0].broker.name,
      brokerId: ledgers[0].broker.brokerId,
      phone: ledgers[0].broker.phone,
      email: ledgers[0].broker.email,
      address: ledgers[0].broker.address
    } : null;

    res.status(200).json({
      success: true,
      data: {
        broker: brokerDetails,
        branches: uniqueBranches.map(name => ({ name })),
        dateRange: {
          from: fromDate || ledgers[0]?.createdAt,
          fromFormatted: fromDate ? new Date(fromDate).toLocaleDateString('en-GB') : 
                         (ledgers[0]?.createdAt ? new Date(ledgers[0].createdAt).toLocaleDateString('en-GB') : null),
          to: toDate || new Date(),
          toFormatted: toDate ? new Date(toDate).toLocaleDateString('en-GB') : new Date().toLocaleDateString('en-GB')
        },
        closingBalance: finalBalance,
        closingBalanceFormatted: `₹${finalBalance.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
        onAccountBalance: calculatedOnAccountBalance,
        onAccountBalanceFormatted: `₹${calculatedOnAccountBalance.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
        transactions: finalStatement,
        onAccountPayments: onAccountPayments.filter(p => p.approvalStatus === 'Approved'),
        exchangeSummary: {
          totalExchangeTransactions: exchangeTransactions.length,
          totalExchangeAmount: totalExchangeAmount,
          totalExchangeAmountFormatted: `₹${totalExchangeAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
          totalExchangeAllocations: exchangeAllocations.length,
          totalExchangeAllocationsAmount: totalExchangeAllocations,
          totalExchangeAllocationsAmountFormatted: `₹${totalExchangeAllocations.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
          exchangeVehicles: exchangeVehicles
        },
        summary: {
          totalCredit: totalCredit,
          totalCreditFormatted: `₹${totalCredit.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
          totalDebit: totalDebit,
          totalDebitFormatted: `₹${totalDebit.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
          totalOnAccount: totalOnAccount,
          totalOnAccountFormatted: `₹${totalOnAccount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
          totalAllocated: totalAllocated,
          totalAllocatedFormatted: `₹${totalAllocated.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
          netBalance: finalBalance,
          netBalanceFormatted: `₹${finalBalance.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
          transactionCount: finalStatement.length,
          creditCount: finalStatement.filter(t => t.type === 'CREDIT').length,
          debitCount: finalStatement.filter(t => t.type === 'DEBIT').length,
          allocationCount: finalStatement.filter(t => t.isAllocation).length
        }
      }
    });

  } catch (error) {
    console.error('Error generating statement:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({
      success: false,
      message: error.message || 'Error generating statement'
    });
  }
};

exports.getDetailedBrokersSummary = async (req, res) => {
  try {
    const { branchId: branchFilter, page = 1, limit = 20 } = req.query;
    const skip = (page - 1) * limit;

    // ========== SAFE ROLE EXTRACTION ==========
    const userRoles = [];
    if (req.user?.roles) {
      if (Array.isArray(req.user.roles)) {
        req.user.roles.forEach(r => {
          if (typeof r === 'string') userRoles.push(r);
          else if (r && typeof r === 'object' && r.name) userRoles.push(r.name);
        });
      }
    }

    console.log('[BROKER-SUMMARY] User roles:', userRoles);

    const isSalesExecutive = userRoles.includes('SALES_EXECUTIVE');
    const isSubdealerUser = userRoles.some(r => 
      ['SUBBROKER', 'SUBDEALER', 'SUBDEALER_USER', 'SUBBROKER_EXECUTIVE'].includes(r)
    );
    const isADBDM = userRoles.some(r => {
      if (typeof r === 'string') return r.toUpperCase() === 'ADBDM';
      return false;
    });
    
    const isSuperAdmin = userRoles.includes("SUPERADMIN");
    
    // Extract user branch ID properly (handle both string and object)
    let userBranchId = null;
    if (req.user?.branch) {
      if (typeof req.user.branch === 'string') {
        userBranchId = req.user.branch;
      } else if (req.user.branch._id) {
        userBranchId = req.user.branch._id.toString();
      } else if (req.user.branch.toString) {
        userBranchId = req.user.branch.toString();
      }
    }
    
    const userSubdealer = req.user?.subdealer;
    const branchAccess = req.user?.branchAccess || 'OWN';
    const assignedSubdealers = req.user?.assignedSubdealers || [];

    console.log('[BROKER-SUMMARY] User branch ID:', userBranchId);
    console.log('[BROKER-SUMMARY] Branch access:', branchAccess);

    // ========== BUILD BROKER QUERY ==========
    let brokerQuery = { "branches.isActive": true };
    const branchConditions = [];

    // Apply branch filter based on user role and access
    if (branchFilter && (isSuperAdmin || isADBDM)) {
      // If branch filter is provided and user is superadmin or ADBDM, apply the filter
      brokerQuery["branches.branch"] = new mongoose.Types.ObjectId(branchFilter);
    } else if (!isSuperAdmin && !isADBDM) {
      // Non-admin users need role-based filtering
      
      // Sales Executive - can see brokers associated with their branch
      if (isSalesExecutive) {
        if (userBranchId) {
          branchConditions.push({ "branches.branch": new mongoose.Types.ObjectId(userBranchId) });
        }
      }
      
      // Subdealer User - can see brokers associated with their subdealer's branch
      if (isSubdealerUser) {
        if (userSubdealer) {
          // Get branch associated with subdealer
          const subdealer = await mongoose.model('Subdealer').findById(userSubdealer).select('branch').lean();
          if (subdealer?.branch) {
            let subdealerBranchId = null;
            if (typeof subdealer.branch === 'string') {
              subdealerBranchId = subdealer.branch;
            } else if (subdealer.branch._id) {
              subdealerBranchId = subdealer.branch._id.toString();
            } else if (subdealer.branch.toString) {
              subdealerBranchId = subdealer.branch.toString();
            }
            
            if (subdealerBranchId) {
              branchConditions.push({ "branches.branch": new mongoose.Types.ObjectId(subdealerBranchId) });
            }
          }
        } else if (assignedSubdealers && assignedSubdealers.length > 0) {
          // Get branches from assigned subdealers
          const subdealers = await mongoose.model('Subdealer').find({ 
            _id: { $in: assignedSubdealers } 
          }).select('branch').lean();
          
          const branchIds = [];
          subdealers.forEach(s => {
            if (s.branch) {
              let branchId = null;
              if (typeof s.branch === 'string') {
                branchId = s.branch;
              } else if (s.branch._id) {
                branchId = s.branch._id.toString();
              } else if (s.branch.toString) {
                branchId = s.branch.toString();
              }
              if (branchId) {
                branchIds.push(branchId);
              }
            }
          });
          
          const uniqueBranchIds = [...new Set(branchIds)];
          if (uniqueBranchIds.length > 0) {
            branchConditions.push({ 
              "branches.branch": { $in: uniqueBranchIds.map(id => new mongoose.Types.ObjectId(id)) } 
            });
          }
        }
      }
      
      // Regular user with branch access OWN
      if (userBranchId && branchAccess === 'OWN') {
        branchConditions.push({ "branches.branch": new mongoose.Types.ObjectId(userBranchId) });
      } else if (userBranchId && branchAccess === 'ALL') {
        // ALL access - no branch filter
        console.log('[BROKER-SUMMARY] User has ALL branch access - no branch filter applied');
      }
      
      // Apply branch conditions to query
      if (branchConditions.length > 0) {
        if (branchConditions.length === 1) {
          brokerQuery = { ...brokerQuery, ...branchConditions[0] };
        } else {
          brokerQuery = { ...brokerQuery, $or: branchConditions };
        }
      }
    }

    console.log('[BROKER-SUMMARY] Broker query:', JSON.stringify(brokerQuery, null, 2));

    // Determine target branch for other queries (bookings, ledger)
    let targetBranchId = null;
    if (branchFilter && (isSuperAdmin || isADBDM)) {
      targetBranchId = branchFilter;
    } else if (userBranchId && branchAccess === 'OWN' && !branchFilter && !isSuperAdmin && !isADBDM) {
      targetBranchId = userBranchId;
    } else if (branchConditions.length === 1 && branchConditions[0]["branches.branch"]) {
      // If we have a single branch condition, use that as target
      const singleBranchId = branchConditions[0]["branches.branch"];
      if (singleBranchId) {
        targetBranchId = singleBranchId.toString();
      }
    }

    console.log('[BROKER-SUMMARY] Target branch ID:', targetBranchId);

    // ========== FETCH BROKERS ==========
    const brokers = await Broker.find(brokerQuery)
      .populate("branches.branch", "name code address")
      .populate("createdBy", "name email")
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    // Get total count for pagination
    const totalCount = await Broker.countDocuments(brokerQuery);

    // ========== BUILD BOOKING AND LEDGER QUERIES ==========
    let bookingQuery = { exchange: true };
    let ledgerQuery = {};

    // Apply branch filters to bookings and ledger
    if (targetBranchId) {
      bookingQuery.branch = new mongoose.Types.ObjectId(targetBranchId);
      ledgerQuery.branch = new mongoose.Types.ObjectId(targetBranchId);
    } else if (!isSuperAdmin && !isADBDM && branchConditions.length > 0) {
      // If we have multiple branches in conditions, we need to query all relevant branches
      const allowedBranchIds = [];
      
      branchConditions.forEach(condition => {
        if (condition["branches.branch"]) {
          const branchId = condition["branches.branch"];
          if (branchId) {
            allowedBranchIds.push(branchId.toString());
          }
        } else if (condition.$or) {
          condition.$or.forEach(orCondition => {
            if (orCondition["branches.branch"]) {
              const branchId = orCondition["branches.branch"];
              if (branchId) {
                allowedBranchIds.push(branchId.toString());
              }
            }
          });
        }
      });
      
      const uniqueBranchIds = [...new Set(allowedBranchIds)];
      if (uniqueBranchIds.length > 0) {
        bookingQuery.branch = { $in: uniqueBranchIds.map(id => new mongoose.Types.ObjectId(id)) };
        ledgerQuery.branch = { $in: uniqueBranchIds.map(id => new mongoose.Types.ObjectId(id)) };
      }
    }

    console.log('[BROKER-SUMMARY] Booking query:', JSON.stringify(bookingQuery, null, 2));
    console.log('[BROKER-SUMMARY] Ledger query:', JSON.stringify(ledgerQuery, null, 2));

    // ========== FETCH RELATED DATA ==========
    const exchangeBookings = await Booking.find(bookingQuery)
      .populate("exchangeDetails.broker", "name mobile email")
      .populate("branch", "name code")
      .populate("model", "name variant")
      .populate("color", "name code")
      .populate("salesExecutive", "name")
      .populate("customerDetails", "name mobile email address")
      .lean();

    const ledgerEntries = await BrokerLedger.find(ledgerQuery)
      .populate("broker", "name mobile email")
      .populate("branch", "name code")
      .populate({
        path: "transactions",
        populate: [
          { path: "booking", select: "bookingNumber customerDetails chassisNumber" },
          { path: "bank", select: "name" },
          { path: "cashLocation", select: "name" },
          { path: "createdBy", select: "name" }
        ]
      })
      .lean();

    // ========== CREATE LOOKUP MAPS ==========
    const bookingsByBrokerAndBranch = {};
    const ledgerByBrokerAndBranch = {};

    // Process exchange bookings
    exchangeBookings.forEach(booking => {
      if (booking.exchangeDetails && booking.exchangeDetails.broker && booking.branch) {
        const brokerId = booking.exchangeDetails.broker._id?.toString();
        let branchId = null;
        
        if (booking.branch._id) {
          branchId = booking.branch._id.toString();
        } else if (typeof booking.branch === 'string') {
          branchId = booking.branch;
        } else if (booking.branch.toString) {
          branchId = booking.branch.toString();
        }

        if (brokerId && branchId) {
          if (!bookingsByBrokerAndBranch[brokerId]) {
            bookingsByBrokerAndBranch[brokerId] = {};
          }
          if (!bookingsByBrokerAndBranch[brokerId][branchId]) {
            bookingsByBrokerAndBranch[brokerId][branchId] = [];
          }

          const detailedBooking = {
            _id: booking._id,
            bookingNumber: booking.bookingNumber,
            bookingDate: booking.bookingDate,
            customerDetails: booking.customerDetails ? {
              name: booking.customerDetails.name,
              mobile: booking.customerDetails.mobile,
              email: booking.customerDetails.email,
              address: booking.customerDetails.address
            } : null,
            vehicleDetails: {
              model: booking.model ? {
                name: booking.model.name,
                variant: booking.model.variant
              } : null,
              color: booking.color ? {
                name: booking.color.name,
                code: booking.color.code
              } : null,
              chassisNumber: booking.chassisNumber,
              engineNumber: booking.engineNumber
            },
            exchangeDetails: {
              exchangeAmount: booking.exchangeDetails?.exchangeAmount || 0,
              oldVehicleDetails: booking.exchangeDetails?.oldVehicleDetails || {},
              rcStatus: booking.exchangeDetails?.rcStatus
            },
            financeDetails: booking.financeDetails ? {
              bank: booking.financeDetails.bank?.name,
              loanAmount: booking.financeDetails.loanAmount,
              status: booking.financeDetails.status
            } : null,
            salesExecutive: booking.salesExecutive?.name,
            bookingStatus: booking.bookingStatus,
            deliveryStatus: booking.deliveryStatus,
            createdAt: booking.createdAt,
            updatedAt: booking.updatedAt
          };

          bookingsByBrokerAndBranch[brokerId][branchId].push(detailedBooking);
        }
      }
    });

    // Process ledger entries
    ledgerEntries.forEach(ledger => {
      if (ledger.broker && ledger.branch) {
        const brokerId = ledger.broker._id?.toString();
        let branchId = null;
        
        if (ledger.branch._id) {
          branchId = ledger.branch._id.toString();
        } else if (typeof ledger.branch === 'string') {
          branchId = ledger.branch;
        } else if (ledger.branch.toString) {
          branchId = ledger.branch.toString();
        }

        if (brokerId && branchId) {
          if (!ledgerByBrokerAndBranch[brokerId]) {
            ledgerByBrokerAndBranch[brokerId] = {};
          }

          // Filter only APPROVED transactions for financial calculations
          const approvedTransactions = (ledger.transactions || []).filter(
            txn => txn.approvalStatus === 'Approved'
          );

          const detailedLedger = {
            _id: ledger._id,
            currentBalance: ledger.currentBalance || 0,
            onAccount: ledger.onAccount || 0,
            transactions: approvedTransactions.map(txn => ({
              _id: txn._id,
              date: txn.date,
              type: txn.type,
              amount: txn.amount,
              modeOfPayment: txn.modeOfPayment,
              referenceNumber: txn.referenceNumber,
              bank: txn.bank?.name,
              cashLocation: txn.cashLocation?.name,
              booking: txn.booking ? {
                bookingNumber: txn.booking.bookingNumber,
                customerName: txn.booking.customerDetails ?
                  `${txn.booking.customerDetails.salutation || ''} ${txn.booking.customerDetails.name || ''}`.trim() :
                  'N/A',
                chassisNumber: txn.booking.chassisNumber
              } : null,
              remark: txn.remark,
              isOnAccount: txn.isOnAccount,
              allocations: txn.allocations || [],
              adjustedAgainst: txn.adjustedAgainst || [],
              createdBy: txn.createdBy?.name,
              createdAt: txn.createdAt,
              approvalStatus: txn.approvalStatus
            })),
            // Store ALL transactions for recent transactions display
            allTransactions: ledger.transactions || [],
            createdAt: ledger.createdAt,
            updatedAt: ledger.updatedAt
          };

          ledgerByBrokerAndBranch[brokerId][branchId] = detailedLedger;
        }
      }
    });

    // ========== PREPARE BROKER SUMMARIES ==========
    const brokerSummaries = [];

    for (const broker of brokers) {
      const brokerId = broker._id.toString();

      for (const branchInfo of broker.branches || []) {
        if (!branchInfo.branch) continue;

        let currentBranchId = null;
        if (branchInfo.branch._id) {
          currentBranchId = branchInfo.branch._id.toString();
        } else if (typeof branchInfo.branch === 'string') {
          currentBranchId = branchInfo.branch;
        } else if (branchInfo.branch.toString) {
          currentBranchId = branchInfo.branch.toString();
        }

        if (!currentBranchId) continue;

        // Apply branch filter based on user permissions
        if (branchFilter && (isSuperAdmin || isADBDM)) {
          if (currentBranchId !== branchFilter) continue;
        } else if (!isSuperAdmin && !isADBDM && targetBranchId) {
          if (currentBranchId !== targetBranchId) continue;
        } else if (!isSuperAdmin && !isADBDM && !targetBranchId && branchConditions.length > 0) {
          // Check if this branch is allowed based on conditions
          let isBranchAllowed = false;
          
          branchConditions.forEach(condition => {
            if (condition["branches.branch"]) {
              const conditionBranchId = condition["branches.branch"].toString();
              if (conditionBranchId === currentBranchId) {
                isBranchAllowed = true;
              }
            } else if (condition.$or) {
              condition.$or.forEach(orCondition => {
                if (orCondition["branches.branch"]) {
                  const conditionBranchId = orCondition["branches.branch"].toString();
                  if (conditionBranchId === currentBranchId) {
                    isBranchAllowed = true;
                  }
                }
              });
            }
          });
          
          if (!isBranchAllowed) continue;
        }

        const bookings = bookingsByBrokerAndBranch[brokerId]?.[currentBranchId] || [];

        const totalExchangeAmount = bookings.reduce((sum, booking) => {
          return sum + (booking.exchangeDetails?.exchangeAmount || 0);
        }, 0);

        const deliveredBookings = bookings.filter(b => b.deliveryStatus === "Delivered").length;
        const pendingBookings = bookings.filter(b => b.deliveryStatus !== "Delivered").length;

        const ledgerInfo = ledgerByBrokerAndBranch[brokerId]?.[currentBranchId] || {
          currentBalance: 0,
          onAccount: 0,
          transactions: [],
          allTransactions: []
        };

        let totalCredit = 0;
        let totalDebit = 0;
        let recalculatedBalance = 0;
        let recalculatedOnAccount = 0;

        // Calculate financials based on APPROVED transactions only
        if (ledgerInfo.transactions) {
          ledgerInfo.transactions.forEach(txn => {
            if (txn.type === "CREDIT") {
              totalCredit += txn.amount || 0;
              recalculatedBalance += txn.amount || 0;
              
              // Calculate on-account balance for approved CREDIT transactions only
              if (txn.isOnAccount) {
                recalculatedOnAccount += txn.amount || 0;
                
                // Subtract any allocations from on-account balance
                const allocatedAmount = txn.allocations?.reduce((sum, alloc) =>
                  sum + (alloc.amount || 0), 0) || 0;
                recalculatedOnAccount -= allocatedAmount;
              }
            } else if (txn.type === "DEBIT") {
              totalDebit += txn.amount || 0;
              recalculatedBalance -= txn.amount || 0;
            }
          });
        }

        // Ensure on-account balance doesn't go negative
        recalculatedOnAccount = Math.max(0, recalculatedOnAccount);

        // For recent transactions, show ALL transactions (including pending)
        const recentTransactions = [...(ledgerInfo.allTransactions || [])]
          .sort((a, b) => new Date(b.date) - new Date(a.date))
          .slice(0, 5)
          .map(txn => ({
            ...txn,
            approvalStatus: txn.approvalStatus || 'Approved'
          }));

        const outstandingAmount = Math.max(0, totalDebit - totalCredit);

        brokerSummaries.push({
          broker: {
            _id: broker._id,
            name: broker.name,
            mobile: broker.mobile,
            email: broker.email,
            address: broker.address,
            brokerId: broker.brokerId,
            panNumber: broker.panNumber,
            gstNumber: broker.gstNumber,
            bankDetails: broker.bankDetails,
            createdAt: broker.createdAt
          },
          branch: {
            _id: branchInfo.branch._id || branchInfo.branch,
            name: branchInfo.branch.name,
            code: branchInfo.branch.code,
            address: branchInfo.branch.address
          },
          bookings: {
            total: bookings.length,
            delivered: deliveredBookings,
            pending: pendingBookings,
            details: bookings.map(booking => ({
              _id: booking._id,
              bookingNumber: booking.bookingNumber,
              bookingDate: booking.bookingDate,
              customer: booking.customerDetails,
              vehicle: booking.vehicleDetails,
              exchangeAmount: booking.exchangeDetails.exchangeAmount,
              status: {
                booking: booking.bookingStatus,
                delivery: booking.deliveryStatus
              },
              createdAt: booking.createdAt
            }))
          },
          financials: {
            totalExchangeAmount,
            ledger: {
              currentBalance: recalculatedBalance,
              onAccount: recalculatedOnAccount,
              totalCredit,
              totalDebit,
              outstandingAmount,
              transactions: ledgerInfo.transactions.length
            },
            summary: {
              totalReceived: totalCredit,
              totalPayable: totalDebit,
              netBalance: recalculatedBalance
            }
          },
          recentTransactions: recentTransactions,
          association: {
            since: branchInfo.associationDate,
            isActive: branchInfo.isActive,
            commissionRate: branchInfo.commissionRate
          },
          lastUpdated: broker.updatedAt || broker.createdAt
        });
      }
    }

    // Calculate summary totals based on approved transactions only
    const totalOnAccount = brokerSummaries.reduce((sum, b) => sum + b.financials.ledger.onAccount, 0);

    // ========== FINAL RESPONSE ==========
    res.status(200).json({
      success: true,
      data: {
        brokers: brokerSummaries,
        summary: {
          totalBrokers: brokerSummaries.length,
          totalBookings: brokerSummaries.reduce((sum, b) => sum + b.bookings.total, 0),
          totalExchangeAmount: brokerSummaries.reduce((sum, b) => sum + b.financials.totalExchangeAmount, 0),
          totalOutstanding: brokerSummaries.reduce((sum, b) => sum + b.financials.ledger.outstandingAmount, 0),
          totalOnAccount: totalOnAccount
        },
        pagination: {
          current: parseInt(page),
          total: Math.ceil(totalCount / limit),
          count: brokerSummaries.length,
          totalRecords: totalCount,
          hasNext: parseInt(page) < Math.ceil(totalCount / limit),
          hasPrev: parseInt(page) > 1
        },
        userRoles,
        userBranch: req.user?.branch || null,
        userSubdealer: req.user?.subdealer || null,
        branchAccess,
        isADBDM,
        filteredByBranch: branchFilter || (targetBranchId ? targetBranchId : "ALL")
      }
    });

  } catch (error) {
    console.error("Error fetching detailed brokers summary:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Error fetching detailed brokers summary",
      error: process.env.NODE_ENV === "development" ? error.stack : undefined
    });
  }
};
exports.getBrokerWiseSummary = async (req, res) => {
  try {
    const { branchId } = req.params;
    
    // Check if "detailed" is passed as branchId
    if (branchId === 'detailed') {
      // Redirect to the detailed summary function
      return exports.getDetailedBrokersSummary(req, res);
    }
    
    const { page = 1, limit = 20 } = req.query;
    const skip = (page - 1) * limit;

    // Validate branchId is a valid ObjectId
    if (!mongoose.isValidObjectId(branchId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid branch ID format'
      });
    }

    // Rest of your existing getBrokerWiseSummary code...
    // Get all brokers for the specified branch
    const brokers = await Broker.find({ 
      'branches.branch': branchId, 
      'branches.isActive': true 
    })
    .populate('branches.branch')
    .populate('createdBy', 'name email')
    .skip(skip)
    .limit(parseInt(limit));

    // Get total count for pagination
    const totalCount = await Broker.countDocuments({ 
      'branches.branch': branchId, 
      'branches.isActive': true 
    });

    // Get all exchange bookings for this branch
    const exchangeBookings = await Booking.find({ 
      exchange: true,
      branch: branchId 
    })
    .populate('exchangeDetails.broker')
    .populate('model')
    .populate('color')
    .lean();

    // Get all ledger entries for this branch
    const ledgerEntries = await BrokerLedger.find({ branch: branchId })
      .populate('broker')
      .lean();

    // Create maps for quick lookup
    const bookingsByBroker = {};
    const ledgerByBroker = {};

    exchangeBookings.forEach(booking => {
      if (booking.exchangeDetails && booking.exchangeDetails.broker) {
        const brokerId = booking.exchangeDetails.broker._id.toString();
        if (!bookingsByBroker[brokerId]) {
          bookingsByBroker[brokerId] = [];
        }
        bookingsByBroker[brokerId].push(booking);
      }
    });

    ledgerEntries.forEach(ledger => {
      const brokerIdObj = ledger && ledger.broker && ledger.broker._id ? ledger.broker._id : null;
      if (!brokerIdObj) return; // Skip ledgers without a populated broker
      const brokerId = brokerIdObj.toString();
      ledgerByBroker[brokerId] = ledger;
    });

    // Prepare response
    const brokerSummaries = brokers.map(broker => {
      const brokerId = broker._id.toString();
      const bookings = bookingsByBroker[brokerId] || [];
      const ledger = ledgerByBroker[brokerId] || {
        currentBalance: 0,
        onAccount: 0
      };

      const totalExchangeAmount = bookings.reduce((sum, booking) => {
        return sum + (booking.exchangeDetails?.exchangeAmount || 0);
      }, 0);

      return {
        broker: {
          _id: broker._id,
          name: broker.name,
          mobile: broker.mobile,
          email: broker.email,
          brokerId: broker.brokerId
        },
        totalBookings: bookings.length,
        totalExchangeAmount,
        ledger: {
          currentBalance: ledger.currentBalance,
          onAccount: ledger.onAccount
        }
      };
    });

    res.status(200).json({
      success: true,
      data: {
        branch: branchId,
        brokers: brokerSummaries,
        pagination: {
          current: parseInt(page),
          total: Math.ceil(totalCount / limit),
          count: brokerSummaries.length,
          totalRecords: totalCount
        }
      }
    });

  } catch (error) {
    console.error('Error fetching broker-wise summary:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Error fetching broker-wise summary'
    });
  }
};
// ============================================================
// API 1: Get all transactions for a broker in a specific branch
// ============================================================
exports.getBrokerBranchTransactions = async (req, res) => {
  try {
    const { brokerId, branchId } = req.params;
    const { fromDate, toDate, page = 1, limit = 50 } = req.query;
    const skip = (page - 1) * limit;

    if (!mongoose.isValidObjectId(brokerId) || !mongoose.isValidObjectId(branchId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid broker ID or branch ID'
      });
    }

    // Find the ledger for this broker and branch
    const ledger = await BrokerLedger.findOne({ 
      broker: brokerId, 
      branch: branchId 
    })
    .populate('broker', 'name brokerId phone email address')
    .populate('branch', 'name code address city phone email')
    .populate({
      path: 'transactions',
      match: {
        date: {
          $gte: new Date(fromDate || '1970-01-01'),
          $lte: new Date(toDate || Date.now())
        }
      },
      options: { 
        sort: { date: -1 },
        skip: skip,
        limit: parseInt(limit)
      },
      populate: [
        { 
          path: 'booking',
          select: 'bookingNumber customerDetails chassisNumber model color branch exchange exchangeDetails payment accessoriesTotal totalAmount discountedAmount receivedAmount balanceAmount bookingType status createdAt createdBy',
          populate: [
            {
              path: 'model',
              select: 'model_name vehicle_type'
            },
            {
              path: 'color',
              select: 'name code'
            },
            {
              path: 'branch',
              select: 'name code'
            },
            {
              path: 'createdBy',
              select: 'name email'
            },
            {
              path: 'exchangeDetails.broker',
              select: 'name brokerId phone'
            }
          ]
        },
        { path: 'bank', select: 'name accountNumber ifsc branchName' },
        { path: 'cashLocation', select: 'name location' },
        { path: 'subPaymentMode', select: 'payment_mode' },
        { path: 'createdBy', select: 'name email username' },
        { path: 'approvedBy', select: 'name email' },
        {
          path: 'allocations.booking',
          select: 'bookingNumber customerDetails chassisNumber model color exchange exchangeDetails',
          populate: [
            {
              path: 'model',
              select: 'model_name'
            },
            {
              path: 'color',
              select: 'name'
            },
            {
              path: 'exchangeDetails.broker',
              select: 'name brokerId'
            }
          ]
        }
      ]
    });

    if (!ledger) {
      return res.status(404).json({
        success: false,
        message: 'Ledger not found for this broker and branch'
      });
    }

    // Get total count for pagination
    const totalCount = await BrokerLedger.aggregate([
      { $match: { broker: new mongoose.Types.ObjectId(brokerId), branch: new mongoose.Types.ObjectId(branchId) } },
      { $unwind: '$transactions' },
      {
        $match: {
          'transactions.date': {
            $gte: new Date(fromDate || '1970-01-01'),
            $lte: new Date(toDate || Date.now())
          }
        }
      },
      { $count: 'total' }
    ]);

    const total = totalCount.length > 0 ? totalCount[0].total : 0;

    // Format transactions with enhanced details
    const formattedTransactions = ledger.transactions.map(txn => {
      // Extract exchange details if present
      let exchangeDetails = null;
      if (txn.booking && txn.booking.exchange === true && txn.booking.exchangeDetails) {
        exchangeDetails = {
          isExchange: true,
          vehicleNumber: txn.booking.exchangeDetails.vehicleNumber || 'N/A',
          chassisNumber: txn.booking.exchangeDetails.chassisNumber || 'N/A',
          price: txn.booking.exchangeDetails.price || 0,
          priceFormatted: `₹${(txn.booking.exchangeDetails.price || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
          broker: txn.booking.exchangeDetails.broker ? {
            id: txn.booking.exchangeDetails.broker._id,
            name: txn.booking.exchangeDetails.broker.name || 'N/A',
            brokerId: txn.booking.exchangeDetails.broker.brokerId || 'N/A'
          } : null,
          brokerName: txn.booking.exchangeDetails.broker?.name || 'N/A',
          status: txn.booking.exchangeDetails.status || 'PENDING'
        };
      }

      // Simple display format as requested
      const exchangeDisplay = {
        Exchange: (txn.booking && txn.booking.exchange) ? 'Yes' : 'No',
        VehicleNumber: txn.booking?.exchangeDetails?.vehicleNumber || 'N/A',
        ChassisNumber: txn.booking?.exchangeDetails?.chassisNumber || 'N/A',
        Price: txn.booking?.exchangeDetails?.price ? 
          `₹${txn.booking.exchangeDetails.price.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : 'N/A',
        Broker: txn.booking?.exchangeDetails?.broker?.name || 'N/A'
      };

      return {
        _id: txn._id,
        date: txn.date,
        dateFormatted: txn.date ? new Date(txn.date).toLocaleString('en-GB') : null,
        type: txn.type,
        amount: txn.amount,
        amountFormatted: `₹${txn.amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
        modeOfPayment: txn.modeOfPayment,
        subPaymentMode: txn.subPaymentMode ? {
          _id: txn.subPaymentMode._id,
          payment_mode: txn.subPaymentMode.payment_mode
        } : null,
        referenceNumber: txn.referenceNumber,
        receiptNumber: txn.receiptNumber,
        approvalStatus: txn.approvalStatus,
        isOnAccount: txn.isOnAccount || false,
        
        // Exchange details in requested format
        exchangeDisplay: exchangeDisplay,
        
        // Detailed exchange info if available
        exchangeDetails: exchangeDetails,
        
        // Booking details
        booking: txn.booking ? {
          _id: txn.booking._id,
          bookingNumber: txn.booking.bookingNumber,
          customerName: txn.booking.customerDetails ? 
            `${txn.booking.customerDetails.salutation || ''} ${txn.booking.customerDetails.name || ''}`.trim() : 'N/A',
          customerMobile: txn.booking.customerDetails?.mobile1 || 'N/A',
          chassisNumber: txn.booking.chassisNumber || 'N/A',
          model: txn.booking.model?.model_name || 'N/A',
          color: txn.booking.color?.name || 'N/A',
          totalAmount: txn.booking.totalAmount || 0,
          discountedAmount: txn.booking.discountedAmount || 0,
          balanceAmount: txn.booking.balanceAmount || 0
        } : null,
        
        // Payment details
        bank: txn.bank ? {
          _id: txn.bank._id,
          name: txn.bank.name,
          accountNumber: txn.bank.accountNumber ? `XXXX${txn.bank.accountNumber.slice(-4)}` : 'XXXX',
          ifsc: txn.bank.ifsc
        } : null,
        
        cashLocation: txn.cashLocation ? {
          _id: txn.cashLocation._id,
          name: txn.cashLocation.name,
          location: txn.cashLocation.location
        } : null,
        
        remark: txn.remark,
        
        // Allocation details
        allocations: (txn.allocations || []).map(alloc => ({
          _id: alloc._id,
          amount: alloc.amount,
          amountFormatted: `₹${alloc.amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
          date: alloc.date,
          dateFormatted: alloc.date ? new Date(alloc.date).toLocaleString('en-GB') : null,
          allocationType: alloc.allocationType,
          booking: alloc.booking ? {
            bookingNumber: alloc.booking.bookingNumber,
            customerName: alloc.booking.customerDetails ? 
              `${alloc.booking.customerDetails.salutation || ''} ${alloc.booking.customerDetails.name || ''}`.trim() : 'N/A',
            chassisNumber: alloc.booking.chassisNumber
          } : null
        })),
        
        // Creator info
        createdBy: txn.createdBy ? {
          _id: txn.createdBy._id,
          name: txn.createdBy.name,
          email: txn.createdBy.email
        } : null,
        createdByName: txn.createdBy?.name || 'System',
        
        createdAt: txn.createdAt,
        updatedAt: txn.updatedAt
      };
    });

    // Calculate summary
    const summary = {
      totalCredit: formattedTransactions
        .filter(t => t.type === 'CREDIT')
        .reduce((sum, t) => sum + t.amount, 0),
      totalDebit: formattedTransactions
        .filter(t => t.type === 'DEBIT')
        .reduce((sum, t) => sum + t.amount, 0),
      onAccountBalance: ledger.onAccountBalance || 0,
      currentBalance: ledger.currentBalance || 0
    };

    summary.totalCreditFormatted = `₹${summary.totalCredit.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    summary.totalDebitFormatted = `₹${summary.totalDebit.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    summary.onAccountBalanceFormatted = `₹${summary.onAccountBalance.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    summary.currentBalanceFormatted = `₹${summary.currentBalance.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

    res.status(200).json({
      success: true,
      data: {
        broker: {
          _id: ledger.broker._id,
          name: ledger.broker.name,
          brokerId: ledger.broker.brokerId,
          phone: ledger.broker.phone,
          email: ledger.broker.email,
          address: ledger.broker.address
        },
        branch: {
          _id: ledger.branch._id,
          name: ledger.branch.name,
          code: ledger.branch.code,
          address: ledger.branch.address,
          city: ledger.branch.city,
          phone: ledger.branch.phone,
          email: ledger.branch.email
        },
        ledgerInfo: {
          _id: ledger._id,
          currentBalance: ledger.currentBalance,
          onAccount: ledger.onAccount,
          onAccountBalance: ledger.onAccountBalance,
          createdAt: ledger.createdAt,
          updatedAt: ledger.updatedAt
        },
        dateRange: {
          from: fromDate || 'All',
          to: toDate || 'All',
          fromFormatted: fromDate ? new Date(fromDate).toLocaleDateString('en-GB') : 'All',
          toFormatted: toDate ? new Date(toDate).toLocaleDateString('en-GB') : 'All'
        },
        summary: summary,
        transactions: formattedTransactions,
        pagination: {
          current: parseInt(page),
          total: Math.ceil(total / limit),
          count: formattedTransactions.length,
          totalRecords: total,
          hasNext: parseInt(page) < Math.ceil(total / limit),
          hasPrev: parseInt(page) > 1
        }
      }
    });

  } catch (error) {
    console.error('Error fetching broker branch transactions:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({
      success: false,
      message: error.message || 'Error fetching broker branch transactions'
    });
  }
};

// ============================================================
// API 2: Get transaction by ID with full details
// ============================================================
exports.getTransactionById = async (req, res) => {
  try {
    const { transactionId } = req.params;

    if (!mongoose.isValidObjectId(transactionId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid transaction ID'
      });
    }

    // Find the ledger containing this transaction
    const ledger = await BrokerLedger.findOne({
      'transactions._id': transactionId
    })
    .populate('broker', 'name brokerId phone email address')
    .populate('branch', 'name code address city phone email')
    .populate({
      path: 'transactions',
      match: { _id: transactionId },
      populate: [
        { 
          path: 'booking',
          select: 'bookingNumber customerDetails chassisNumber model color branch exchange exchangeDetails payment accessoriesTotal totalAmount discountedAmount receivedAmount balanceAmount bookingType status createdAt createdBy rto rtoAmount insuranceStatus',
          populate: [
            {
              path: 'model',
              select: 'model_name vehicle_type'
            },
            {
              path: 'color',
              select: 'name code'
            },
            {
              path: 'branch',
              select: 'name code'
            },
            {
              path: 'createdBy',
              select: 'name email'
            },
            {
              path: 'exchangeDetails.broker',
              select: 'name brokerId phone'
            },
            {
              path: 'payment.financer',
              select: 'name'
            }
          ]
        },
        { path: 'bank', select: 'name accountNumber ifsc branchName' },
        { path: 'cashLocation', select: 'name location' },
        { path: 'subPaymentMode', select: 'payment_mode' },
        { path: 'createdBy', select: 'name email username' },
        { path: 'approvedBy', select: 'name email' },
        {
          path: 'allocations.booking',
          select: 'bookingNumber customerDetails chassisNumber model color exchange exchangeDetails',
          populate: [
            {
              path: 'model',
              select: 'model_name'
            },
            {
              path: 'color',
              select: 'name'
            },
            {
              path: 'exchangeDetails.broker',
              select: 'name brokerId'
            }
          ]
        },
        {
          path: 'adjustedAgainst.booking',
          select: 'bookingNumber customerDetails chassisNumber'
        }
      ]
    });

    if (!ledger) {
      return res.status(404).json({
        success: false,
        message: 'Transaction not found'
      });
    }

    // Get the transaction
    const transaction = ledger.transactions[0];
    if (!transaction) {
      return res.status(404).json({
        success: false,
        message: 'Transaction not found'
      });
    }

    // Format exchange details
    let exchangeDetails = null;
    let exchangeDisplay = {
      Exchange: 'No',
      VehicleNumber: 'N/A',
      ChassisNumber: 'N/A',
      Price: 'N/A',
      Broker: 'N/A'
    };

    if (transaction.booking && transaction.booking.exchange === true && transaction.booking.exchangeDetails) {
      exchangeDetails = {
        isExchange: true,
        vehicleNumber: transaction.booking.exchangeDetails.vehicleNumber || 'N/A',
        chassisNumber: transaction.booking.exchangeDetails.chassisNumber || 'N/A',
        price: transaction.booking.exchangeDetails.price || 0,
        priceFormatted: `₹${(transaction.booking.exchangeDetails.price || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
        broker: transaction.booking.exchangeDetails.broker ? {
          _id: transaction.booking.exchangeDetails.broker._id,
          name: transaction.booking.exchangeDetails.broker.name || 'N/A',
          brokerId: transaction.booking.exchangeDetails.broker.brokerId || 'N/A',
          phone: transaction.booking.exchangeDetails.broker.phone || 'N/A'
        } : null,
        brokerName: transaction.booking.exchangeDetails.broker?.name || 'N/A',
        status: transaction.booking.exchangeDetails.status || 'PENDING',
        otpVerified: transaction.booking.exchangeDetails.otpVerified || false,
        completedAt: transaction.booking.exchangeDetails.completedAt,
        completedAtFormatted: transaction.booking.exchangeDetails.completedAt ? 
          new Date(transaction.booking.exchangeDetails.completedAt).toLocaleString('en-GB') : null
      };

      exchangeDisplay = {
        Exchange: 'Yes',
        VehicleNumber: transaction.booking.exchangeDetails.vehicleNumber || 'N/A',
        ChassisNumber: transaction.booking.exchangeDetails.chassisNumber || 'N/A',
        Price: transaction.booking.exchangeDetails.price ? 
          `₹${transaction.booking.exchangeDetails.price.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : 'N/A',
        Broker: transaction.booking.exchangeDetails.broker?.name || 'N/A'
      };
    }

    // Format the response exactly like the example you provided
    const response = {
      success: true,
      data: {
        _id: transaction._id,
        broker: {
          _id: ledger.broker._id,
          name: ledger.broker.name,
          mobile: ledger.broker.phone,
          brokerId: ledger.broker.brokerId,
          email: ledger.broker.email,
          address: ledger.broker.address,
          id: ledger.broker._id
        },
        branch: {
          _id: ledger.branch._id,
          name: ledger.branch.name,
          code: ledger.branch.code,
          address: ledger.branch.address,
          city: ledger.branch.city,
          phone: ledger.branch.phone,
          email: ledger.branch.email,
          id: ledger.branch._id
        },
        __v: 0,
        createdAt: ledger.createdAt,
        createdBy: transaction.createdBy?._id || ledger.createdBy,
        currentBalance: ledger.currentBalance,
        onAccount: ledger.onAccount,
        transactions: [{
          _id: transaction._id,
          date: transaction.date,
          type: transaction.type,
          amount: transaction.amount,
          modeOfPayment: transaction.modeOfPayment,
          subPaymentMode: transaction.subPaymentMode ? {
            _id: transaction.subPaymentMode._id,
            payment_mode: transaction.subPaymentMode.payment_mode,
            id: transaction.subPaymentMode._id
          } : null,
          referenceNumber: transaction.referenceNumber,
          receiptNumber: transaction.receiptNumber,
          autoAllocationStatus: transaction.autoAllocationStatus || 'PENDING',
          bank: transaction.bank ? {
            _id: transaction.bank._id,
            name: transaction.bank.name,
            accountNumber: transaction.bank.accountNumber ? `XXXX${transaction.bank.accountNumber.slice(-4)}` : 'XXXX',
            ifsc: transaction.bank.ifsc,
            branchName: transaction.bank.branchName,
            id: transaction.bank._id
          } : null,
          cashLocation: transaction.cashLocation ? {
            _id: transaction.cashLocation._id,
            name: transaction.cashLocation.name,
            location: transaction.cashLocation.location,
            id: transaction.cashLocation._id
          } : null,
          booking: transaction.booking ? {
            _id: transaction.booking._id,
            bookingNumber: transaction.booking.bookingNumber,
            customerDetails: transaction.booking.customerDetails ? {
              name: transaction.booking.customerDetails.name,
              mobile1: transaction.booking.customerDetails.mobile1,
              salutation: transaction.booking.customerDetails.salutation,
              custId: transaction.booking.customerDetails.custId
            } : null,
            chassisNumber: transaction.booking.chassisNumber,
            model: transaction.booking.model ? {
              _id: transaction.booking.model._id,
              model_name: transaction.booking.model.model_name,
              vehicle_type: transaction.booking.model.vehicle_type
            } : null,
            color: transaction.booking.color ? {
              _id: transaction.booking.color._id,
              name: transaction.booking.color.name,
              code: transaction.booking.color.code
            } : null,
            exchange: transaction.booking.exchange,
            exchangeDetails: transaction.booking.exchangeDetails ? {
              vehicleNumber: transaction.booking.exchangeDetails.vehicleNumber,
              chassisNumber: transaction.booking.exchangeDetails.chassisNumber,
              price: transaction.booking.exchangeDetails.price,
              status: transaction.booking.exchangeDetails.status,
              broker: transaction.booking.exchangeDetails.broker ? {
                _id: transaction.booking.exchangeDetails.broker._id,
                name: transaction.booking.exchangeDetails.broker.name,
                brokerId: transaction.booking.exchangeDetails.broker.brokerId,
                phone: transaction.booking.exchangeDetails.broker.phone
              } : null
            } : null,
            // Add exchange display in requested format
            exchangeDisplay: exchangeDisplay,
            totalAmount: transaction.booking.totalAmount,
            discountedAmount: transaction.booking.discountedAmount,
            balanceAmount: transaction.booking.balanceAmount,
            branch: transaction.booking.branch ? {
              _id: transaction.booking.branch._id,
              name: transaction.booking.branch.name,
              code: transaction.booking.branch.code
            } : null
          } : null,
          branch: ledger.branch._id,
          remark: transaction.remark,
          isOnAccount: transaction.isOnAccount || false,
          adjustedAgainst: (transaction.adjustedAgainst || []).map(adj => ({
            booking: adj.booking ? {
              _id: adj.booking._id,
              bookingNumber: adj.booking.bookingNumber,
              customerName: adj.booking.customerDetails ? 
                `${adj.booking.customerDetails.salutation || ''} ${adj.booking.customerDetails.name || ''}`.trim() : 'N/A',
              chassisNumber: adj.booking.chassisNumber
            } : null,
            amount: adj.amount
          })),
          allocations: (transaction.allocations || []).map(alloc => ({
            _id: alloc._id,
            booking: alloc.booking ? {
              _id: alloc.booking._id,
              bookingNumber: alloc.booking.bookingNumber,
              customerName: alloc.booking.customerDetails ? 
                `${alloc.booking.customerDetails.salutation || ''} ${alloc.booking.customerDetails.name || ''}`.trim() : 'N/A',
              chassisNumber: alloc.booking.chassisNumber
            } : null,
            amount: alloc.amount,
            date: alloc.date,
            allocationType: alloc.allocationType
          })),
          createdBy: transaction.createdBy ? {
            _id: transaction.createdBy._id,
            name: transaction.createdBy.name,
            email: transaction.createdBy.email,
            username: transaction.createdBy.username,
            availableDeviationAmount: null,
            availableDiscountLimits: {
              onRoadPrice: 0,
              addOnServices: 0,
              accessories: 0
            },
            totalBookingDeviationGrants: 0,
            totalGMBookingDeviationGrants: 0,
            activeBookingDeviations: [],
            id: transaction.createdBy._id
          } : {
            _id: ledger.createdBy,
            name: 'System',
            id: ledger.createdBy
          },
          approvalStatus: transaction.approvalStatus,
          approvedBy: transaction.approvedBy ? {
            _id: transaction.approvedBy._id,
            name: transaction.approvedBy.name,
            email: transaction.approvedBy.email,
            id: transaction.approvedBy._id
          } : null,
          approvedAt: transaction.approvedAt,
          createdAt: transaction.createdAt,
          updatedAt: transaction.updatedAt,
          id: transaction._id
        }],
        updatedAt: ledger.updatedAt,
        onAccountBalance: ledger.onAccountBalance,
        id: ledger._id
      },
      onAccountBalance: ledger.onAccountBalance,
      message: 'Transaction retrieved successfully'
    };

    res.status(200).json(response);

  } catch (error) {
    console.error('Error fetching transaction by ID:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({
      success: false,
      message: error.message || 'Error fetching transaction'
    });
  }
};
exports.autoAllocateFunds = async (req, res) => {
  try {
    const { brokerId, branchId } = req.params;
    const userId = req.user.id;

    console.log(`Auto-allocation triggered for broker: ${brokerId}, branch: ${branchId}`);

    const ledger = await BrokerLedger.findOne({ broker: brokerId, branch: branchId })
      .populate('transactions.allocations.booking')
      .populate('transactions.booking');
    
    if (!ledger) {
      return res.status(404).json({
        success: false,
        message: 'Ledger not found for this broker and branch'
      });
    }

    console.log(`Current onAccount balance: ${ledger.onAccountBalance}`);
    const receiptNumber = `REF-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const updatedLedger = await autoAllocateOnAccountFunds(ledger, userId, receiptNumber);
    
    if (updatedLedger.isModified()) {
      await updatedLedger.save();
      console.log('Auto-allocation completed and saved');
    } else {
      console.log('No changes made during auto-allocation');
    }

    res.status(200).json({
      success: true,
      data: {
        onAccountBalanceBefore: ledger.onAccountBalance,
        onAccountBalanceAfter: updatedLedger.onAccountBalance,
        totalAllocated: ledger.onAccountBalance - updatedLedger.onAccountBalance,
        allocationsMade: updatedLedger.transactions.reduce((count, tx) => 
          count + (tx.allocations?.filter(a => a.allocationType === 'AUTO').length || 0), 0
        ),
        remainingOnAccount: updatedLedger.onAccountBalance,
        receiptNumber:receiptNumber
      },
      message: 'Auto-allocation completed successfully. Broker on-account balance allocated to exchange bookings (first come first serve).'
    });

  } catch (error) {
    console.error('Error in auto-allocation:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Error in auto-allocation',
      error: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};
