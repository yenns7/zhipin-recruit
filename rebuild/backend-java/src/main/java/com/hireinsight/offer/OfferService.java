package com.hireinsight.offer;

import com.hireinsight.model.OfferRecord;
import com.hireinsight.repository.OfferRecordRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Map;

@Service
public class OfferService {

    private final OfferRecordRepository offerRepository;

    public OfferService(OfferRecordRepository offerRepository) {
        this.offerRepository = offerRepository;
    }

    @Transactional
    public OfferRecord create(OfferRecord offer) {
        offer.setStatus(OfferRecord.Status.PENDING);
        return offerRepository.save(offer);
    }

    @Transactional
    public OfferRecord approve(Long id) {
        OfferRecord offer = offerRepository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("Offer not found: " + id));
        offer.setStatus(OfferRecord.Status.APPROVED);
        return offerRepository.save(offer);
    }

    @Transactional
    public OfferRecord withdraw(Long id) {
        OfferRecord offer = offerRepository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("Offer not found: " + id));
        offer.setStatus(OfferRecord.Status.WITHDRAWN);
        return offerRepository.save(offer);
    }

    Map<String, Object> toResponse(OfferRecord offer) {
        return Map.of(
                "id", offer.getId(),
                "status", offer.getStatus().name()
        );
    }
}
